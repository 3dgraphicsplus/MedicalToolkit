import ShadersBase from '../shaders.base';

class Texture3d extends ShadersBase {
  constructor() {
    super();
    this.name = 'texture3d';

    // default properties names
    this._dataCoordinates = 'dataCoordinates';
    this._dataValue = 'dataValue';
    this._offset = 'offset';
  }

  api(
    baseFragment = this._base,
    dataCoordinates = this._dataCoordinates,
    dataValue = this._dataValue,
    offset = this._offset
  ) {
    this._base = baseFragment;
    return this.compute(dataCoordinates, dataValue, offset);
  }

  compute(dataCoordinates, dataValue, offset) {
    this.computeDefinition();
    this._base._functions[this._name] = this._definition;
    return `${this._name}(${dataCoordinates}, ${dataValue}, ${offset});`;
  }

  computeDefinition() {
    // Only sample the texture that contains the voxel. Summing a fetch from
    // every texture unit made each lookup 7-14x more expensive, which in
    // ray marching (8 lookups per step, hundreds of steps per pixel) is
    // enough to trigger a GPU reset ("context lost").
    const nbTextures = this._base._uniforms.uTextureContainer.length === 14 ? 14 : 7;
    let content = `  if (textureIndex == 0) {
    dataValue = texture2D(uTextureContainer[0], uv);
  }`;
    for (let i = 1; i < nbTextures; i++) {
      content += ` else if (textureIndex == ${i}) {
    dataValue = texture2D(uTextureContainer[${i}], uv);
  }`;
    }

    this._definition = `
void ${this._name}(in ivec3 dataCoordinates, out vec4 dataValue, out int offset){
  float textureSizeF = float(uTextureSize);
  int voxelsPerTexture = uTextureSize*uTextureSize;

  int index = dataCoordinates.x
            + dataCoordinates.y * uDataDimensions.x
            + dataCoordinates.z * uDataDimensions.y * uDataDimensions.x;
  
  // dividing an integer by an integer will give you an integer result, rounded down
  // can not get float numbers to work :(
  int packedIndex = index/uPackedPerPixel;
  offset = index - uPackedPerPixel*packedIndex;

  // Map data index to right sampler2D texture
  int textureIndex = packedIndex/voxelsPerTexture;
  int inTextureIndex = packedIndex - voxelsPerTexture*textureIndex;

  // Get row and column in the texture
  int rowIndex = inTextureIndex/uTextureSize;
  float rowIndexF = float(rowIndex);
  float colIndex = float(inTextureIndex - uTextureSize * rowIndex);

  // Map row and column to uv
  vec2 uv = vec2(0,0);
  uv.x = (0.5 + colIndex) / textureSizeF;
  uv.y = 1. - (0.5 + rowIndexF) / textureSizeF;

  dataValue = vec4(0.);
${content}
}
    `;
  }
}

export default new Texture3d();
