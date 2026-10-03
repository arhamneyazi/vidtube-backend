import { v2 as cloudinary } from "cloudinary";
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config();

// Configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    console.log("File uploaded on Cloudinary. File src: " + response.url);

    // Once the file is uploaded, we want to delete it from our servers
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    console.log("Error on cloudinary", error);
    fs.unlinkSync(localFilePath);
    return null;
  }
};

const deleteFromCloudinary = async (publicID, resourceType = "image") => {
  try {
    const result = await cloudinary.uploader.destroy(publicID, {
      resource_type: resourceType,
    });
    console.log("File deleted from Cloudinary. Public ID:", publicID);

    return result;
  } catch (error) {
    console.log("Error deleting file from Cloudinary", error);
    return null;
  }
};

const extractPublicId = (url) => {
  if (!url) return null;

  const afterUpload = url.split("/upload/")[1];

  if (!afterUpload) return null;

  const withoutVersion = afterUpload.split("/").slice(1).join("/");
  const publicId = withoutVersion.replace(/\.[^/.]+$/, "");

  return publicId;
};

export { uploadOnCloudinary, deleteFromCloudinary, extractPublicId };
