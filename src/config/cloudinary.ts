import { v2 as cloudinary } from "cloudinary";

// Re-export unified storage engine functions so all existing controllers
// and scripts continue working seamlessly with zero changes needed.
export {
  uploadImage,
  deleteImage,
  uploadToCloudinary,
  deleteFromCloudinary,
  withAutoOptimization,
  optimizeImageBuffer,
} from "./storage";

export default cloudinary;
