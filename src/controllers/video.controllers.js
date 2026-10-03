import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  extractPublicId,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";

//TODO: get all videos based on query, sort, pagination
const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

  const filter = { isPublished: true };

  if (userId) {
    if (!isValidObjectId(userId)) {
      throw new ApiError(400, "Invalid User ID");
    }
    filter.owner = userId;
  }

  if (query) {
    filter.$or = [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
    ];
  }

  const sortField = sortBy || "createdAt";
  const sortOptions = {};
  sortOptions[sortField] = sortType === "asc" ? 1 : -1;

  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  const skip = (pageNumber - 1) * limitNumber;

  const videos = await Video.find(filter)
    .sort(sortOptions)
    .skip(skip)
    .limit(limitNumber);

  const totalVideos = await Video.countDocuments(filter);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        totalVideos,
        totalPages: Math.ceil(totalVideos / limitNumber),
        currentPage: pageNumber,
      },
      "Videos fetched successfully"
    )
  );
});

const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  if (!title?.trim() || !description?.trim()) {
    throw new ApiError(400, "Title and description are required");
  }

  const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
  const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

  if (!videoFileLocalPath || !thumbnailLocalPath) {
    throw new ApiError(400, "File is missing");
  }

  let videoFile;
  try {
    videoFile = await uploadOnCloudinary(videoFileLocalPath);
    console.log(videoFile);
  } catch (error) {
    console.log("Error uploading video file", error);
    throw new ApiError(400, "Failed to upload video file");
  }

  let thumbnail;
  try {
    thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
  } catch (error) {
    console.log("Error uploading thumbnail", error);
    throw new ApiError(400, "Failed to upload thumbnail");
  }

  try {
    const video = await Video.create({
      videoFile: videoFile.url,
      thumbnail: thumbnail.url,
      title,
      description,
      duration: videoFile.duration,
      owner: req.user?._id,
    });

    if (!video) {
      throw new ApiError(500, "Something went wrong while uploading the video");
    }

    return res
      .status(201)
      .json(new ApiResponse(201, video, "Video uploaded successfully"));
  } catch (error) {
    console.log("Video uploading failed", error);

    if (videoFile) {
      await deleteFromCloudinary(videoFile.public_id, "video");
    }

    if (thumbnail) {
      await deleteFromCloudinary(thumbnail.public_id);
    }

    throw new ApiError(500, "Something went wrong and the files were deleted");
  }
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  let { title, description } = req.body;

  title = title?.trim();
  description = description?.trim();

  const thumbnailLocalPath = req.file?.path;

  if (!title && !description && !thumbnailLocalPath) {
    throw new ApiError(400, "At least one field is required to update");
  }

  const existingVideo = await Video.findById(videoId);

  if (!existingVideo) {
    throw new ApiError(404, "Existing video not found");
  }

  if (existingVideo.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You are not authorized to update this video");
  }

  const oldThumbnailUrl = existingVideo.thumbnail;

  let newThumbnailUrl;

  if (thumbnailLocalPath) {
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!thumbnail.url) {
      throw new ApiError(500, "Failed to change thumbnail");
    }

    newThumbnailUrl = thumbnail.url;
  }

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    { $set: { title, description, thumbnail: newThumbnailUrl } },
    { new: true }
  );

  if (!updatedVideo) {
    throw new ApiError(404, "Video not found");
  }

  if (newThumbnailUrl && oldThumbnailUrl) {
    const oldPublicId = extractPublicId(oldThumbnailUrl);

    try {
      await deleteFromCloudinary(oldPublicId);
    } catch (error) {
      console.log("Failed to delete old thumbnail", error);
    }
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedVideo, "Video details updated successfully")
    );
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  if (video.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You are not authorized to delete this video");
  }

  const deletedVideo = await Video.findByIdAndDelete(videoId);

  if (!deletedVideo) {
    throw new ApiError(500, "Something went wrong while deleting the video");
  }

  const videoPublicId = extractPublicId(video.videoFile);
  const thumbnailPublicId = extractPublicId(video.thumbnail);

  try {
    await deleteFromCloudinary(videoPublicId, "video");
    await deleteFromCloudinary(thumbnailPublicId);
  } catch (error) {
    console.log("Failed to delete video files from cloudinary", error);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video deleted successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  if (video.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(
      403,
      "You are not authorized to change status of this video"
    );
  }

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    { $set: { isPublished: !video.isPublished } },
    { new: true }
  );

  if (!updatedVideo) {
    throw new ApiError(404, "Video not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedVideo, "Status changed successfully"));
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
