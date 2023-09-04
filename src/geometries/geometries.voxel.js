/**
 *
 * @module geometries/voxel
 */

const geometriesVoxel = (three = window.THREE) => {
  if (three === undefined || three.BoxGeometry === undefined) {
    return null;
  }

  const Constructor = three.BoxGeometry;
  return class extends Constructor {
    constructor(dataPosition) {
      super(1, 1, 1);

      this._location = dataPosition;

      this.applyMatrix4(
        new three.Matrix4().makeTranslation(this._location.x, this._location.y, this._location.z)
      );

      this.verticesNeedUpdate = true;
    }

    resetVertices() {
      const {position} = this.attributes;
      position.set([0.5, 0.5, 0.5],0);
      position.set([0.5, 0.5, -0.5],1);
      position.set([0.5, -0.5, 0.5],2);
      position.set([0.5, -0.5, -0.5],3);
      position.set([-0.5, 0.5, -0.5],4);
      position.set([-0.5, 0.5, 0.5],5);
      position.set([-0.5, -0.5, -0.5],6);
      position.set([-0.5, -0.5, 0.5],7);
    }

    set location(location) {
      this._location = location;

      const {position} = this.attributes;
      // update vertices from location
      position.set([+0.5, +0.5, +0.5],0);
      position.set([+0.5, +0.5, -0.5],1);
      position.set([+0.5, -0.5, +0.5],2);
      position.set([+0.5, -0.5, -0.5],3);
      position.set([-0.5, +0.5, -0.5],4);
      position.set([-0.5, +0.5, +0.5],5);
      position.set([-0.5, -0.5, -0.5],6);
      position.set([-0.5, -0.5, +0.5],7);

      this.applyMatrix4(
        new three.Matrix4().makeTranslation(this._location.x, this._location.y, this._location.z)
      );

      this.verticesNeedUpdate = true;
    }

    get location() {
      return this._location;
    }
  };
};

// export factory
export { geometriesVoxel };
// default export to
export default geometriesVoxel();
