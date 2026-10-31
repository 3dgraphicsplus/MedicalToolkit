/** * Imports ***/
import { Matrix4 } from 'three';
import { Vector3 } from 'three';

import CoreColors from '../core/core.colors';
import CoreUtils from '../core/core.utils';
import ModelsBase from '../models/models.base';


/**
 * Stack object.
 *
 * @module models/stack
 */
export default class ModelsStack extends ModelsBase {
  /**
   * Models Stack constructor
   */
  constructor() {
    super();

    this._uid = null;
    this._stackID = -1;

    this._frame = [];
    this._numberOfFrames = 0;

    this._rows = 0;
    this._columns = 0;
    this._numberOfChannels = 1;
    this._bitsAllocated = 8;
    this._pixelType = 0;
    this._pixelRepresentation = 0;

    // voxels packed for the GPU (see pack())
    this._volumeData = null;

    this._windowCenter = 0;
    this._windowWidth = 0;

    this._rescaleSlope = 1;
    this._rescaleIntercept = 0;

    this._minMax = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

    // TRANSFORMATION MATRICES
    this._regMatrix = new Matrix4();

    this._ijk2LPS = null;
    this._lps2IJK = null;

    this._aabb2LPS = null;
    this._lps2AABB = null;

    //
    // IJK dimensions
    this._dimensionsIJK = null;
    this._halfDimensionsIJK = null;
    this._spacing = new Vector3(1, 1, 1);
    this._spacingBetweenSlices = 0;
    this._sliceThickness = 0;
    this._origin = null;
    this._rightHanded = true;
    this._xCosine = new Vector3(1, 0, 0);
    this._yCosine = new Vector3(0, 1, 0);
    this._zCosine = new Vector3(0, 0, 1);

    // convenience vars
    this._prepared = false;
    this._packed = false;
    this._packedPerPixel = 1;

    //
    this._modality = 'Modality not set';

    // SEGMENTATION STUFF
    this._segmentationType = null;
    this._segmentationSegments = [];
    this._segmentationDefaultColor = [63, 174, 128];
    this._frameSegment = [];
    this._segmentationLUT = [];
    this._segmentationLUTO = [];

    // photometricInterpretation Monochrome1 VS Monochrome2
    this._invert = false;
  }

  /**
   * Prepare segmentation stack.
   * A segmentation stack can hold x frames that are at the same location
   * but segmentation specific information:
   * - Frame X contains voxels for segmentation A.
   * - Frame Y contains voxels for segmenttation B.
   * - Frame X and Y are at the same location.
   *
   * We currently merge overlaping frames into 1.
   */
  prepareSegmentation() {
    // store frame and do special pre-processing
    this._frameSegment = this._frame;
    let mergedFrames = [];

    // order frames
    this.computeCosines();
    this._frame.map(this._computeDistanceArrayMap.bind(null, this._zCosine));
    this._frame.sort(this._sortDistanceArraySort);

    // merge frames
    let prevIndex = -1;
    for (let i = 0; i < this._frame.length; i++) {
      if (!mergedFrames[prevIndex] || mergedFrames[prevIndex]._dist != this._frame[i]._dist) {
        mergedFrames.push(this._frame[i]);
        prevIndex++;

        // Scale frame
        // by default each frame contains binary data about a segmentation.
        // we scale it by the referenceSegmentNumber in order to have a
        // segmentation specific voxel value rather than 0 or 1.
        // That allows us to merge frames later on.
        // If we merge frames without scaling, then we can not differenciate
        // voxels from segmentation A or B as the value is 0 or 1 in both cases.
        for (let k = 0; k < mergedFrames[prevIndex]._rows * mergedFrames[prevIndex]._columns; k++) {
          mergedFrames[prevIndex]._pixelData[k] *= this._frame[i]._referencedSegmentNumber;
        }
      } else {
        // frame already exsits at this location.
        // merge data from this segmentation into existing frame
        for (let k = 0; k < mergedFrames[prevIndex]._rows * mergedFrames[prevIndex]._columns; k++) {
          mergedFrames[prevIndex]._pixelData[k] +=
            this._frame[i].pixelData[k] * this._frame[i]._referencedSegmentNumber;
        }
      }

      mergedFrames[prevIndex].minMax = CoreUtils.minMax(mergedFrames[prevIndex]._pixelData);
    }

    // get information about segments
    let dict = {};
    let max = 0;
    for (let i = 0; i < this._segmentationSegments.length; i++) {
      max = Math.max(max, parseInt(this._segmentationSegments[i].segmentNumber, 10));

      let color = this._segmentationSegments[i].recommendedDisplayCIELab;
      if (color === null) {
        dict[this._segmentationSegments[i].segmentNumber] = this._segmentationDefaultColor;
      } else {
        dict[this._segmentationSegments[i].segmentNumber] = CoreColors.cielab2RGB(...color);
      }
    }

    // generate LUTs
    for (let i = 0; i <= max; i++) {
      let index = i / max;
      let opacity = i ? 1 : 0;
      let rgb = [0, 0, 0];
      if (dict.hasOwnProperty(i.toString())) {
        rgb = dict[i.toString()];
      }

      rgb[0] /= 255;
      rgb[1] /= 255;
      rgb[2] /= 255;

      this._segmentationLUT.push([index, ...rgb]);
      this._segmentationLUTO.push([index, opacity]);
    }

    this._frame = mergedFrames;
  }

  /**
   * Compute cosines
   * Order frames
   * computeSpacing
   * sanityCheck
   * init some vars
   * compute min/max
   * compute transformation matrices
   *
   * @return {*}
   */
  prepare() {
    // if segmentation, merge some frames...
    if (this._modality === 'SEG') {
      this.prepareSegmentation();
    }

    this.computeNumberOfFrames();

    // pass parameters from frame to stack
    this._rows = this._frame[0].rows;
    this._columns = this._frame[0].columns;
    this._dimensionsIJK = new Vector3(this._columns, this._rows, this._numberOfFrames);
    this._halfDimensionsIJK = new Vector3(
      this._dimensionsIJK.x / 2,
      this._dimensionsIJK.y / 2,
      this._dimensionsIJK.z / 2
    );
    this._spacingBetweenSlices = this._frame[0].spacingBetweenSlices;
    this._sliceThickness = this._frame[0].sliceThickness;

    // compute direction cosines
    this.computeCosines();

    // order the frames
    if (this._numberOfFrames > 1) {
      this.orderFrames();
    }

    // compute/guess spacing
    this.computeSpacing();
    // set extra vars if nulls
    // do it now because before we would think image position/orientation
    // are defined and we would use it to compute spacing.
    if (!this._frame[0].imagePosition) {
      this._frame[0].imagePosition = [0, 0, 0];
    }
    if (!this._frame[0].imageOrientation) {
      this._frame[0].imageOrientation = [1, 0, 0, 0, 1, 0];
    }

    this._origin = this._arrayToVector3(this._frame[0].imagePosition, 0);

    // compute transforms
    this.computeIJK2LPS();

    this.computeLPS2AABB();
    // this.packEchos();

    const middleFrameIndex = Math.floor(this._frame.length / 2);
    const middleFrame = this._frame[middleFrameIndex];

    this._rescaleSlope = middleFrame.rescaleSlope || 1;
    this._rescaleIntercept = middleFrame.rescaleIntercept || 0;

    // rescale/slope min max
    this.computeMinMaxIntensities();
    this._minMax[0] = CoreUtils.rescaleSlopeIntercept(
      this._minMax[0],
      this._rescaleSlope,
      this._rescaleIntercept
    );
    this._minMax[1] = CoreUtils.rescaleSlopeIntercept(
      this._minMax[1],
      this._rescaleSlope,
      this._rescaleIntercept
    );

    this._windowWidth = middleFrame.windowWidth || this._minMax[1] - this._minMax[0];

    this._windowCenter = middleFrame.windowCenter || this._minMax[0] + this._windowWidth / 2;

    this._bitsAllocated = middleFrame.bitsAllocated;
    this._prepared = true;
  }

  packEchos() {
    // 4 echo times...
    let echos = 4;
    let packedEcho = [];
    for (let i = 0; i < this._frame.length; i += echos) {
      let frame = this._frame[i];
      for (let k = 0; k < this._rows * this._columns; k++) {
        for (let j = 1; j < echos; j++) {
          frame.pixelData[k] += this._frame[i + j].pixelData[k];
        }
        frame.pixelData[k] /= echos;
      }
      packedEcho.push(frame);
    }
    this._frame = packedEcho;
    this._numberOfFrames = this._frame.length;
    this._dimensionsIJK = new Vector3(this._columns, this._rows, this._numberOfFrames);
    this._halfDimensionsIJK = new Vector3(
      this._dimensionsIJK.x / 2,
      this._dimensionsIJK.y / 2,
      this._dimensionsIJK.z / 2
    );
  }

  computeNumberOfFrames() {
    // we need at least 1 frame
    if (this._frame && this._frame.length > 0) {
      this._numberOfFrames = this._frame.length;
    } else {
      window.console.warn("_frame doesn't contain anything....");
      window.console.warn(this._frame);
      return false;
    }
  }

  // frame.cosines - returns array [x, y, z]
  computeCosines() {
    if (this._frame && this._frame[0]) {
      let cosines = this._frame[0].cosines();
      this._xCosine = cosines[0];
      this._yCosine = cosines[1];
      this._zCosine = cosines[2];
    }
  }

  orderFrames() {
    // order the frames based on theirs dimension indices
    // first index is the most important.
    // 1,1,1,1 will be first
    // 1,1,2,1 will be next
    // 1,1,2,3 will be next
    // 1,1,3,1 will be next
    if (this._frame[0].dimensionIndexValues) {
      this._frame.sort(this._orderFrameOnDimensionIndicesArraySort);

      // else order with image position and orientation
    } else if (
      this._frame[0].imagePosition &&
      this._frame[0].imageOrientation &&
      this._frame[1] &&
      this._frame[1].imagePosition &&
      this._frame[1].imageOrientation &&
      this._frame[0].imagePosition.join() !== this._frame[1].imagePosition.join()
    ) {
      // compute and sort by dist in this series
      this._frame.map(this._computeDistanceArrayMap.bind(null, this._zCosine));
      this._frame.sort(this._sortDistanceArraySort);
    } else if (
      this._frame[0].instanceNumber !== null &&
      this._frame[1] &&
      this._frame[1].instanceNumber !== null &&
      this._frame[0].instanceNumber !== this._frame[1].instanceNumber
    ) {
      this._frame.sort(this._sortInstanceNumberArraySort);
    } else if (
      this._frame[0].sopInstanceUID &&
      this._frame[1] &&
      this._frame[1].sopInstanceUID &&
      this._frame[0].sopInstanceUID !== this._frame[1].sopInstanceUID
    ) {
      this._frame.sort(this._sortSopInstanceUIDArraySort);
    } else if (!this._frame[0].imagePosition) {
      // cancel warning if you have set null imagePosition on purpose (?)
    } else {
      window.console.warn('do not know how to order the frames...');
    }
  }

  computeSpacing() {
    this.xySpacing();
    this.zSpacing();
  }

  /**
   * Compute stack z spacing
   */
  zSpacing() {
    if (this._numberOfFrames > 1) {
      if (this._frame[0].pixelSpacing && this._frame[0].pixelSpacing[2]) {
        this._spacing.z = this._frame[0].pixelSpacing[2];
      } else {
        // compute and sort by dist in this series
        this._frame.map(this._computeDistanceArrayMap.bind(null, this._zCosine));

        // if distances are different, re-sort array
        if (this._frame[1].dist !== this._frame[0].dist) {
          this._frame.sort(this._sortDistanceArraySort);
          this._spacing.z = this._frame[1].dist - this._frame[0].dist;
        } else if (this._spacingBetweenSlices) {
          this._spacing.z = this._spacingBetweenSlices;
        } else if (this._frame[0].sliceThickness) {
          this._spacing.z = this._frame[0].sliceThickness;
        }
      }
    }

    // Spacing
    // can not be 0 if not matrix can not be inverted.
    if (this._spacing.z === 0) {
      this._spacing.z = 1;
    }
  }

  /**
   *  FRAME CAN DO IT
   */
  xySpacing() {
    if (this._frame && this._frame[0]) {
      let spacingXY = this._frame[0].spacingXY();
      this._spacing.x = spacingXY[0];
      this._spacing.y = spacingXY[1];
    }
  }

  /**
   * Find min and max intensities among all frames.
   */
  computeMinMaxIntensities() {
    // what about colors!!!!?
    // we ignore values if NaNs
    // https://github.com/FNNDSC/ami/issues/185
    for (let i = 0; i < this._frame.length; i++) {
      // get min/max
      let min = this._frame[i].minMax[0];
      if (!Number.isNaN(min)) {
        this._minMax[0] = Math.min(this._minMax[0], min);
      }

      let max = this._frame[i].minMax[1];
      if (!Number.isNaN(max)) {
        this._minMax[1] = Math.max(this._minMax[1], max);
      }
    }
  }

  /**
   * Compute IJK to LPS and invert transforms
   */
  computeIJK2LPS() {
    // ijk to lps
    this._ijk2LPS = CoreUtils.ijk2LPS(
      this._xCosine,
      this._yCosine,
      this._zCosine,
      this._spacing,
      this._origin,
      this._regMatrix
    );

    // lps 2 ijk
    this._lps2IJK = this._ijk2LPS.clone().invert();
  }

  /**
   * Compute LPS to AABB and invert transforms
   */
  computeLPS2AABB() {
    this._aabb2LPS = CoreUtils.aabb2LPS(this._xCosine, this._yCosine, this._zCosine, this._origin);
    this._lps2AABB = this._aabb2LPS.clone().invert();
  }

  /**
   * Merge stacks
   *
   * @param {*} stack
   *
   * @return {*}
   */
  merge(stack) {
    // also make sure x/y/z cosines are a match!
    if (
      this._stackID === stack.stackID &&
      this._numberOfFrames === 1 &&
      stack._numberOfFrames === 1 &&
      this._frame[0].columns === stack.frame[0].columns &&
      this._frame[0].rows === stack.frame[0].rows &&
      this._xCosine.equals(stack.xCosine) &&
      this._yCosine.equals(stack.yCosine) &&
      this._zCosine.equals(stack.zCosine)
    ) {
      return this.mergeModels(this._frame, stack.frame);
    } else {
      return false;
    }
  }

  /**
   * Pack the stack voxels in a single array, one voxel per texel, ready to be
   * uploaded as a 3D texture (see helpers.material.mixin).
   *
   * Values are shifted by -min when the data has negative values so the
   * texture only holds positive values (shaders compensate with the same offset).
   *
   * - 1/8 bits, 1 channel: Uint8Array
   * - 16 bits, 1 channel: Uint16Array
   * - 32 bits, 1 channel: Float32Array
   * - 8 bits, 3 channels: Uint8Array RGBA
   */
  pack() {
    const dims = this._dimensionsIJK;
    const frameDimension = this._frame[0].rows * this._frame[0].columns;
    const nbVoxels = dims.x * dims.y * dims.z;
    const nbFrames = Math.min(this._frame.length, dims.z);
    const offset = this._minMax[0] < 0 ? -this._minMax[0] : 0;

    if (this._numberOfChannels === 3) {
      const data = new Uint8Array(nbVoxels * 4);
      for (let f = 0; f < nbFrames; f++) {
        const pixelData = this._frame[f].pixelData;
        const start = f * frameDimension;
        for (let i = 0; i < frameDimension; i++) {
          const o = 4 * (start + i);
          data[o] = pixelData[3 * i];
          data[o + 1] = pixelData[3 * i + 1];
          data[o + 2] = pixelData[3 * i + 2];
          data[o + 3] = 255;
        }
      }
      this._volumeData = data;
    } else {
      let data;
      if (this._bitsAllocated === 1 || this._bitsAllocated === 8) {
        data = new Uint8Array(nbVoxels);
      } else if (this._bitsAllocated === 16) {
        data = new Uint16Array(nbVoxels);
      } else {
        data = new Float32Array(nbVoxels);
      }

      for (let f = 0; f < nbFrames; f++) {
        const pixelData = this._frame[f].pixelData;
        const start = f * frameDimension;
        for (let i = 0; i < frameDimension; i++) {
          const raw = pixelData[i] + offset;
          if (!Number.isNaN(raw)) {
            data[start + i] = raw;
          }
        }
      }
      this._volumeData = data;
    }

    this._packedPerPixel = 1;
    this._packed = true;
  }

  /**
   * Get the stack world center
   *
   *@return {*}
   */
  worldCenter() {
    let center = this._halfDimensionsIJK
      .clone()
      .addScalar(-0.5)
      .applyMatrix4(this._ijk2LPS);
    return center;
  }

  /**
   * Get the stack world bounding box
   * @return {*}
   */
  worldBoundingBox() {
    let bbox = [
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    const dims = this._dimensionsIJK;

    for (let i = 0; i <= dims.x; i += dims.x) {
      for (let j = 0; j <= dims.y; j += dims.y) {
        for (let k = 0; k <= dims.z; k += dims.z) {
          let world = new Vector3(i, j, k).applyMatrix4(this._ijk2LPS);
          bbox = [
            Math.min(bbox[0], world.x),
            Math.max(bbox[1], world.x), // x min/max
            Math.min(bbox[2], world.y),
            Math.max(bbox[3], world.y),
            Math.min(bbox[4], world.z),
            Math.max(bbox[5], world.z),
          ];
        }
      }
    }

    return bbox;
  }

  /**
   * Get AABB size in LPS space.
   *
   * @return {*}
   */
  AABBox() {
    let world0 = new Vector3()
      .addScalar(-0.5)
      .applyMatrix4(this._ijk2LPS)
      .applyMatrix4(this._lps2AABB);

    let world7 = this._dimensionsIJK
      .clone()
      .addScalar(-0.5)
      .applyMatrix4(this._ijk2LPS)
      .applyMatrix4(this._lps2AABB);

    let minBBox = new Vector3(
      Math.abs(world0.x - world7.x),
      Math.abs(world0.y - world7.y),
      Math.abs(world0.z - world7.z)
    );

    return minBBox;
  }

  /**
   * Get AABB center in LPS space
   */
  centerAABBox() {
    let centerBBox = this.worldCenter();
    centerBBox.applyMatrix4(this._lps2AABB);
    return centerBBox;
  }

  static indexInDimensions(index, dimensions) {
    if (
      index.x >= 0 &&
      index.y >= 0 &&
      index.z >= 0 &&
      index.x < dimensions.x &&
      index.y < dimensions.y &&
      index.z < dimensions.z
    ) {
      return true;
    }

    return false;
  }

  _arrayToVector3(array, index) {
    return new Vector3(array[index], array[index + 1], array[index + 2]);
  }

  _orderFrameOnDimensionIndicesArraySort(a, b) {
    if (
      'dimensionIndexValues' in a &&
      Object.prototype.toString.call(a.dimensionIndexValues) === '[object Array]' &&
      'dimensionIndexValues' in b &&
      Object.prototype.toString.call(b.dimensionIndexValues) === '[object Array]'
    ) {
      for (let i = 0; i < a.dimensionIndexValues.length; i++) {
        if (parseInt(a.dimensionIndexValues[i], 10) > parseInt(b.dimensionIndexValues[i], 10)) {
          return 1;
        }
        if (parseInt(a.dimensionIndexValues[i], 10) < parseInt(b.dimensionIndexValues[i], 10)) {
          return -1;
        }
      }
    } else {
      window.console.warn("One of the frames doesn't have a dimensionIndexValues array.");
      window.console.warn(a);
      window.console.warn(b);
    }

    return 0;
  }

  _computeDistanceArrayMap(normal, frame) {
    if (frame.imagePosition) {
      frame.dist =
        frame.imagePosition[0] * normal.x +
        frame.imagePosition[1] * normal.y +
        frame.imagePosition[2] * normal.z;
    }
    return frame;
  }

  _sortDistanceArraySort(a, b) {
    return a.dist - b.dist;
  }
  _sortInstanceNumberArraySort(a, b) {
    return a.instanceNumber - b.instanceNumber;
  }
  _sortSopInstanceUIDArraySort(a, b) {
    return a.sopInstanceUID - b.sopInstanceUID;
  }

  set numberOfChannels(numberOfChannels) {
    this._numberOfChannels = numberOfChannels;
  }

  get numberOfChannels() {
    return this._numberOfChannels;
  }

  set frame(frame) {
    this._frame = frame;
  }

  get frame() {
    return this._frame;
  }

  set prepared(prepared) {
    this._prepared = prepared;
  }

  get prepared() {
    return this._prepared;
  }

  set packed(packed) {
    this._packed = packed;
  }

  get packed() {
    return this._packed;
  }

  set packedPerPixel(packedPerPixel) {
    this._packedPerPixel = packedPerPixel;
  }

  get packedPerPixel() {
    return this._packedPerPixel;
  }

  set dimensionsIJK(dimensionsIJK) {
    this._dimensionsIJK = dimensionsIJK;
  }

  get dimensionsIJK() {
    return this._dimensionsIJK;
  }

  set halfDimensionsIJK(halfDimensionsIJK) {
    this._halfDimensionsIJK = halfDimensionsIJK;
  }

  get halfDimensionsIJK() {
    return this._halfDimensionsIJK;
  }

  set regMatrix(regMatrix) {
    this._regMatrix = regMatrix;
  }

  get regMatrix() {
    return this._regMatrix;
  }

  set ijk2LPS(ijk2LPS) {
    this._ijk2LPS = ijk2LPS;
  }

  get ijk2LPS() {
    return this._ijk2LPS;
  }

  set lps2IJK(lps2IJK) {
    this._lps2IJK = lps2IJK;
  }

  get lps2IJK() {
    return this._lps2IJK;
  }

  set lps2AABB(lps2AABB) {
    this._lps2AABB = lps2AABB;
  }

  get lps2AABB() {
    return this._lps2AABB;
  }

  set bitsAllocated(bitsAllocated) {
    this._bitsAllocated = bitsAllocated;
  }

  get bitsAllocated() {
    return this._bitsAllocated;
  }

  /**
   * Voxels packed for the GPU, one value per voxel (RGBA for 3 channels).
   * Index: i + j * columns + k * columns * rows.
   */
  set volumeData(volumeData) {
    this._volumeData = volumeData;
  }

  get volumeData() {
    return this._volumeData;
  }

  get windowWidth() {
    return this._windowWidth;
  }

  set windowWidth(windowWidth) {
    this._windowWidth = windowWidth;
  }

  get windowCenter() {
    return this._windowCenter;
  }

  set windowCenter(windowCenter) {
    this._windowCenter = windowCenter;
  }

  get rescaleSlope() {
    return this._rescaleSlope;
  }

  set rescaleSlope(rescaleSlope) {
    this._rescaleSlope = rescaleSlope;
  }

  get rescaleIntercept() {
    return this._rescaleIntercept;
  }

  set rescaleIntercept(rescaleIntercept) {
    this._rescaleIntercept = rescaleIntercept;
  }

  get xCosine() {
    return this._xCosine;
  }

  set xCosine(xCosine) {
    this._xCosine = xCosine;
  }

  get yCosine() {
    return this._yCosine;
  }

  set yCosine(yCosine) {
    this._yCosine = yCosine;
  }

  get zCosine() {
    return this._zCosine;
  }

  set zCosine(zCosine) {
    this._zCosine = zCosine;
  }

  get minMax() {
    return this._minMax;
  }

  set minMax(minMax) {
    this._minMax = minMax;
  }

  get stackID() {
    return this._stackID;
  }

  set stackID(stackID) {
    this._stackID = stackID;
  }

  get pixelType() {
    return this._pixelType;
  }

  set pixelType(pixelType) {
    this._pixelType = pixelType;
  }

  get pixelRepresentation() {
    return this._pixelRepresentation;
  }

  set pixelRepresentation(pixelRepresentation) {
    this._pixelRepresentation = pixelRepresentation;
  }

  set invert(invert) {
    this._invert = invert;
  }

  get invert() {
    return this._invert;
  }

  set modality(modality) {
    this._modality = modality;
  }

  get modality() {
    return this._modality;
  }

  get rightHanded() {
    return this._rightHanded;
  }

  set rightHanded(rightHanded) {
    this._rightHanded = rightHanded;
  }

  get spacingBetweenSlices() {
    return this._spacingBetweenSlices;
  }

  set spacingBetweenSlices(spacingBetweenSlices) {
    this._spacingBetweenSlices = spacingBetweenSlices;
  }

  set segmentationSegments(segmentationSegments) {
    this._segmentationSegments = segmentationSegments;
  }

  get segmentationSegments() {
    return this._segmentationSegments;
  }

  set segmentationType(segmentationType) {
    this._segmentationType = segmentationType;
  }

  get segmentationType() {
    return this._segmentationType;
  }

  set segmentationLUT(segmentationLUT) {
    this._segmentationLUT = segmentationLUT;
  }

  get segmentationLUT() {
    return this._segmentationLUT;
  }

  set segmentationLUTO(segmentationLUTO) {
    this._segmentationLUTO = segmentationLUTO;
  }

  get segmentationLUTO() {
    return this._segmentationLUTO;
  }

  // DEPRECATED FUNCTION

  /**
   * @deprecated for core.utils.value
   *
   * Get voxel value.
   *
   * @param {*} stack
   * @param {*} coordinate
   *
   * @return {*}
   */
  static value(stack, coordinate) {
    window.console.warn(
      `models.stack.value is deprecated.
       Please use core.utils.value instead.`
    );
    return CoreUtils.value(stack, coordinate);
  }

  /**
   * @deprecated for core.utils.rescaleSlopeIntercept
   *
   * Apply slope/intercept to a value.
   *
   * @param {*} value
   * @param {*} slope
   * @param {*} intercept
   *
   * @return {*}
   */
  static valueRescaleSlopeIntercept(value, slope, intercept) {
    window.console.warn(
      `models.stack.valueRescaleSlopeIntercept is deprecated.
       Please use core.utils.rescaleSlopeIntercept instead.`
    );
    return CoreUtils.rescaleSlopeIntercept(value, slope, intercept);
  }

  /**
   * @deprecated for core.utils.worldToData
   *
   * Transform coordinates from world coordinate to data
   *
   * @param {*} stack
   * @param {*} worldCoordinates
   *
   * @return {*}
   */
  static worldToData(stack, worldCoordinates) {
    window.console.warn(
      `models.stack.worldToData is deprecated.
       Please use core.utils.worldToData instead.`
    );

    return CoreUtils.worldToData(stack._lps2IJK, worldCoordinates);
  }
}
