import * as THREE from 'three';
/**
 * Helpers material mixin.
 *
 * @module helpers/material/mixin
 */

const helpersMaterialMixin = (three = THREE) => {
  if (three === undefined || three.Object3D === undefined) {
    return null;
  }

  const Constructor = three.Object3D;
  return class extends Constructor {
    _createMaterial(extraOptions) {
      // generate shaders on-demand!
      let fs = new this._shadersFragment(this._uniforms);
      let vs = new this._shadersVertex();

      // material
      let globalOptions = {
        uniforms: this._uniforms,
        vertexShader: vs.compute(),
        fragmentShader: fs.compute(),
      };

      let options = Object.assign(extraOptions, globalOptions);
      this._material = new three.ShaderMaterial(options);
      this._material.needsUpdate = true;
    }

    _updateMaterial() {
      // generate shaders on-demand!
      let fs = new this._shadersFragment(this._uniforms);
      let vs = new this._shadersVertex();

      this._material.vertexShader = vs.compute();
      this._material.fragmentShader = fs.compute();

      this._material.needsUpdate = true;
    }

    _prepareTexture() {
      // GPU textures are shared by every helper of a stack (slices, volume rendering...)
      // so the same volume is only uploaded once to the GPU.
      const stack = this._stack;
      if (!stack._sharedTextures || stack._sharedTextures.rawData !== stack._rawData) {
        const textures = [];
        for (let m = 0; m < stack._rawData.length; m++) {
          let tex = new three.DataTexture(
            stack.rawData[m],
            stack.textureSize,
            stack.textureSize,
            stack.textureType,
            three.UnsignedByteType,
            three.UVMapping,
            three.ClampToEdgeWrapping,
            three.ClampToEdgeWrapping,
            three.NearestFilter,
            three.NearestFilter
          );
          tex.needsUpdate = true;
          tex.flipY = true;
          textures.push(tex);
        }
        stack._sharedTextures = { rawData: stack._rawData, textures, refs: 0 };
      }

      stack._sharedTextures.refs++;
      this._sharedTextures = stack._sharedTextures;
      this._textures = stack._sharedTextures.textures.slice();
    }

    _releaseTextures() {
      const shared = this._sharedTextures;
      if (shared) {
        shared.refs--;
        if (shared.refs <= 0) {
          shared.textures.forEach(texture => texture.dispose());
          shared.textures.length = 0;
          if (this._stack && this._stack._sharedTextures === shared) {
            this._stack._sharedTextures = null;
          }
        }
      }
      this._sharedTextures = null;
      this._textures = null;
    }
  };
};

export { helpersMaterialMixin };
export default helpersMaterialMixin();
