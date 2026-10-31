import ShadersBase from '../shaders.base';

/**
 * Read voxel values from the stack 3D texture (see core/core.volumetexture).
 *
 * - texture3d(ivec3 voxel, out vec4 value): exact voxel value (0 outside the volume)
 * - texture3dLinear(vec3 voxel): trilinear interpolated value, voxel centers on integers
 */
class Texture3d extends ShadersBase {
  constructor() {
    super();
    this.name = 'texture3d';

    // default properties names
    this._dataCoordinates = 'dataCoordinates';
    this._dataValue = 'dataValue';
  }

  api(baseFragment = this._base, dataCoordinates = this._dataCoordinates, dataValue = this._dataValue) {
    this._base = baseFragment;
    return this.compute(dataCoordinates, dataValue);
  }

  compute(dataCoordinates, dataValue) {
    this.computeDefinition();
    this._base._functions[this._name] = this._definition;
    return `${this._name}(${dataCoordinates}, ${dataValue});`;
  }

  /**
   * Register texture3dLinear() in the base fragment.
   */
  linear(baseFragment = this._base) {
    this._base = baseFragment;
    this.computeDefinition();
    this._base._functions[this._name] = this._definition;

    const filterable =
      !this._base._uniforms.uTextureFilterable || this._base._uniforms.uTextureFilterable.value === 1;

    // hardware trilinear filtering: 1 fetch. Otherwise (float textures without
    // OES_texture_float_linear) interpolate the 8 neighbours manually.
    const body = filterable
      ? `
  return texture(uTexture3D, (voxel + 0.5) / vec3(uDataDimensions)) * uValueScale;`
      : `
  ivec3 maxVoxel = uDataDimensions - 1;
  vec3 lower = floor(voxel);
  vec3 t = voxel - lower;
  ivec3 b = ivec3(lower);
  ivec3 b0 = clamp(b, ivec3(0), maxVoxel);
  ivec3 b1 = clamp(b + 1, ivec3(0), maxVoxel);
  vec4 c00 = mix(texelFetch(uTexture3D, ivec3(b0.x, b0.y, b0.z), 0), texelFetch(uTexture3D, ivec3(b1.x, b0.y, b0.z), 0), t.x);
  vec4 c10 = mix(texelFetch(uTexture3D, ivec3(b0.x, b1.y, b0.z), 0), texelFetch(uTexture3D, ivec3(b1.x, b1.y, b0.z), 0), t.x);
  vec4 c01 = mix(texelFetch(uTexture3D, ivec3(b0.x, b0.y, b1.z), 0), texelFetch(uTexture3D, ivec3(b1.x, b0.y, b1.z), 0), t.x);
  vec4 c11 = mix(texelFetch(uTexture3D, ivec3(b0.x, b1.y, b1.z), 0), texelFetch(uTexture3D, ivec3(b1.x, b1.y, b1.z), 0), t.x);
  return mix(mix(c00, c10, t.y), mix(c01, c11, t.y), t.z) * uValueScale;`;

    this._base._functions['texture3dLinear'] = `
vec4 texture3dLinear(in vec3 voxel) {${body}
}
    `;
  }

  computeDefinition() {
    this._definition = `
void ${this._name}(in ivec3 voxel, out vec4 dataValue){
  if (any(lessThan(voxel, ivec3(0))) || any(greaterThanEqual(voxel, uDataDimensions))) {
    dataValue = vec4(0.);
    return;
  }

  dataValue = texelFetch(uTexture3D, voxel, 0) * uValueScale;
}
    `;
  }
}

export default new Texture3d();
