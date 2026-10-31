import ShadersBase from '../shaders.base';
import Texture3d from '../helpers/shaders.helpers.texture3d';

/**
 * Nearest neighbour interpolation.
 */
class InterpolationIdentity extends ShadersBase {
  constructor() {
    super();
    this.name = 'interpolationIdentity';

    this._currentVoxel = 'currentVoxel';
    this._dataValue = 'dataValue';
  }

  api(baseFragment = this._base, currentVoxel = this._currentVoxel, dataValue = this._dataValue) {
    this._base = baseFragment;
    return this.compute(currentVoxel, dataValue);
  }

  compute(currentVoxel, dataValue) {
    this.computeDefinition();
    this._base._functions[this._name] = this._definition;
    return `${this._name}(${currentVoxel}, ${dataValue});`;
  }

  computeDefinition() {
    this._definition = `
void ${this._name}(in vec3 currentVoxel, out vec4 dataValue){
  ivec3 voxel = ivec3(floor(currentVoxel + 0.5));
  ${Texture3d.api(this._base, 'voxel', 'dataValue')}
}
    `;
  }
}

export default new InterpolationIdentity();
