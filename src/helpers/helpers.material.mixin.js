import * as THREE from 'three';
import CoreVolumeTexture from '../core/core.volumetexture';
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
      // one 3D texture per stack, shared by every helper displaying it
      this._volumeTexture = CoreVolumeTexture.acquire(this._stack);
      this._textures = [this._volumeTexture.texture];
      CoreVolumeTexture.setUniforms(this._uniforms, this._volumeTexture);
    }

    _releaseTextures() {
      if (this._volumeTexture) {
        CoreVolumeTexture.release(this._stack);
        this._volumeTexture = null;
      }
      this._textures = null;
    }
  };
};

export { helpersMaterialMixin };
export default helpersMaterialMixin();
