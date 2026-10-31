import * as THREE from 'three';

/**
 * Upload a stack as a single WebGL2 3D texture, shared by every helper/material
 * that displays it (slices, volume rendering...), so a volume lives only once
 * on the GPU.
 *
 * Formats (one voxel per texel):
 * - 8 bits: R8 (linear filtering)
 * - 16 bits: R16 normalized if EXT_texture_norm16 is available (exact, linear filtering),
 *   R32F otherwise
 * - 32 bits: R32F (linear filtering if OES_texture_float_linear is available)
 * - 3 channels: RGBA8
 *
 * Shaders read `texture(uTexture3D, ...) * uValueScale` to get the stored value back.
 *
 * @module core/volumetexture
 */

let support = null;

/**
 * Probe the WebGL2 extensions that decide the texture formats (done once).
 *
 * @return {{norm16: boolean, floatLinear: boolean, max3DTextureSize: number}}
 */
function getSupport() {
  if (support) {
    return support;
  }

  support = { norm16: false, floatLinear: false, max3DTextureSize: 2048 };
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl) {
      support.norm16 = !!gl.getExtension('EXT_texture_norm16');
      support.floatLinear = !!gl.getExtension('OES_texture_float_linear');
      support.max3DTextureSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) {
        lose.loseContext();
      }
    }
  } catch (e) {
    window.console.warn('AMI: could not probe WebGL2 support', e);
  }

  return support;
}

function createTexture(stack) {
  const dims = stack.dimensionsIJK;
  const caps = getSupport();
  if (Math.max(dims.x, dims.y, dims.z) > caps.max3DTextureSize) {
    window.console.warn(
      `AMI: volume ${dims.x}x${dims.y}x${dims.z} exceeds MAX_3D_TEXTURE_SIZE (${caps.max3DTextureSize})`
    );
  }

  let data = stack.volumeData;
  let format = THREE.RedFormat;
  let type = THREE.FloatType;
  let normalized = false;
  let valueScale = 1;
  let filterable = true;

  if (stack.numberOfChannels === 3) {
    format = THREE.RGBAFormat;
    type = THREE.UnsignedByteType;
  } else if (data instanceof Uint8Array) {
    type = THREE.UnsignedByteType;
    valueScale = 255;
  } else if (data instanceof Uint16Array && caps.norm16) {
    type = THREE.UnsignedShortType;
    normalized = true;
    valueScale = 65535;
  } else {
    if (!(data instanceof Float32Array)) {
      data = Float32Array.from(data);
    }
    filterable = caps.floatLinear;
  }

  const texture = new THREE.Data3DTexture(data, dims.x, dims.y, dims.z);
  texture.format = format;
  texture.type = type;
  texture.normalized = normalized;
  texture.minFilter = texture.magFilter = filterable ? THREE.LinearFilter : THREE.NearestFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  return { texture, valueScale, filterable, refs: 0, volumeData: stack.volumeData };
}

/**
 * Get (and reference) the shared 3D texture of a stack. The stack is packed if needed.
 * Call release() with the same stack when it is not used anymore.
 *
 * @param {ModelsStack} stack
 * @return {{texture: THREE.Data3DTexture, valueScale: number, filterable: boolean}}
 */
function acquire(stack) {
  if (!stack.packed) {
    stack.pack();
  }

  let shared = stack._volumeTexture;
  if (!shared || shared.volumeData !== stack.volumeData) {
    shared = createTexture(stack);
    stack._volumeTexture = shared;
  }

  shared.refs++;
  return shared;
}

/**
 * Release a reference taken with acquire(); the GPU texture is disposed with the last one.
 *
 * @param {ModelsStack} stack
 */
function release(stack) {
  const shared = stack && stack._volumeTexture;
  if (!shared) {
    return;
  }

  shared.refs--;
  if (shared.refs <= 0) {
    shared.texture.dispose();
    stack._volumeTexture = null;
  }
}

/**
 * Set the volume uniforms (uTexture3D, uValueScale, uTextureFilterable) of a material.
 *
 * @param {object} uniforms
 * @param {{texture: THREE.Data3DTexture, valueScale: number, filterable: boolean}} volumeTexture
 */
function setUniforms(uniforms, volumeTexture) {
  uniforms.uTexture3D.value = volumeTexture.texture;
  uniforms.uValueScale.value = volumeTexture.valueScale;
  uniforms.uTextureFilterable.value = volumeTexture.filterable ? 1 : 0;
}

export default { acquire, release, setUniforms, getSupport };
