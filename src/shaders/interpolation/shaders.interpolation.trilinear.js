import ShadersBase from '../shaders.base';
import Texture3d from '../helpers/shaders.helpers.texture3d';

/**
 * Trilinear interpolation (+ gradient for volume rendering shading).
 */
class InterpolationTrilinear extends ShadersBase {
  constructor() {
    super();
    this.name = 'interpolationTrilinear';

    this._currentVoxel = 'currentVoxel';
    this._dataValue = 'dataValue';
    this._gradient = 'gradient';
  }

  api(
    baseFragment = this._base,
    currentVoxel = this._currentVoxel,
    dataValue = this._dataValue,
    gradient = this._gradient
  ) {
    this._base = baseFragment;
    return this.compute(currentVoxel, dataValue, gradient);
  }

  compute(currentVoxel, dataValue, gradient) {
    this.computeDefinition();
    this._base._functions[this._name] = this._definition;
    return `${this._name}(${currentVoxel}, ${dataValue}, ${gradient});`;
  }

  computeDefinition() {
    Texture3d.linear(this._base);

    // the gradient is only needed for shading (volume rendering):
    // central differences, 6 extra fetches, skipped when shading is off
    const uniforms = this._base._uniforms;
    let gradient = '';
    if (uniforms.uShading) {
      const condition = uniforms.uAlgorithm ? 'uShading == 1 && uAlgorithm == 0' : 'uShading == 1';
      gradient = `
  if (${condition}) {
    gradient = vec3(
      texture3dLinear(currentVoxel + vec3(1., 0., 0.)).r - texture3dLinear(currentVoxel - vec3(1., 0., 0.)).r,
      texture3dLinear(currentVoxel + vec3(0., 1., 0.)).r - texture3dLinear(currentVoxel - vec3(0., 1., 0.)).r,
      texture3dLinear(currentVoxel + vec3(0., 0., 1.)).r - texture3dLinear(currentVoxel - vec3(0., 0., 1.)).r
    );

    float gradientMagnitude = length(gradient);
    if (gradientMagnitude > 0.0) {
      gradient = -gradient / gradientMagnitude;
    }
  }`;
    }

    this._definition = `
void ${this._name}(in vec3 currentVoxel, out vec4 dataValue, inout vec3 gradient){
  dataValue = texture3dLinear(currentVoxel);
${gradient}
}
    `;
  }
}

export default new InterpolationTrilinear();
