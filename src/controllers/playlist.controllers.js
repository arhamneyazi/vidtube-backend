import mongoose, { isValidObjectId } from "mongoose";
import { Playlist } from "../models/playlist.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description, videos } = req.body;

  if (!name?.trim()) {
    throw new ApiError(400, "Name is required");
  }

  if (videos && !Array.isArray(videos)) {
    throw new ApiError(400, "Videos must be an array of video IDs");
  }

  if (videos?.length) {
    const allValid = videos.every((videoId) => isValidObjectId(videoId));
    if (!allValid) {
      throw new ApiError(400, "One or more video IDs are invalid");
    }
  }

  try {
    const playlist = await Playlist.create({
      owner: req.user?._id,
      videos: videos || [],
      name: name?.trim(),
      description: description?.trim(),
    });

    if (!playlist) {
      throw new ApiError(
        500,
        "Something went wrong while creating the playlist"
      );
    }

    return res
      .status(201)
      .json(new ApiResponse(201, playlist, "Playlist created successfully"));
  } catch (error) {
    console.log("Playlist creation failed", error);
    throw new ApiError(500, "Something went wrong while creating the playlist");
  }
});

const getUserPlaylists = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const playlists = await Playlist.find({
    owner: new mongoose.Types.ObjectId(userId),
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, playlists, "User playlists fetched successfully")
    );
});

const getPlaylistById = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, playlist, "Playlist fetched successfully"));
});

const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  const existingPlaylist = await Playlist.findById(playlistId);

  if (!existingPlaylist) {
    throw new ApiError(404, "Playlist not found");
  }

  if (existingPlaylist.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(
      403,
      "You are not authorized to add videos to this playlist"
    );
  }

  /* 
  if (existingPlaylist.videos.includes(videoId)) {
    throw new ApiError(400, "Video already exists in the playlist");
  } 
    
  I commented this out because .includes() uses strict equality (===). Since the array contains Mongoose ObjectIds and videoId is a string, it will always return false. Using .some() with .toString() ensures we are comparing two strings.
  */

  const videoAlreadyInPlaylist = existingPlaylist.videos.some(
    (video) => video.toString() === videoId
  );

  if (videoAlreadyInPlaylist) {
    throw new ApiError(400, "Video already exists in the playlist");
  }

  const playlist = await Playlist.findByIdAndUpdate(
    playlistId,
    { $addToSet: { videos: videoId } },
    { new: true }
  );

  if (!playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, playlist, "Video added to playlist successfully")
    );
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  const existingPlaylist = await Playlist.findById(playlistId);

  if (!existingPlaylist) {
    throw new ApiError(404, "Playlist not found");
  }

  if (existingPlaylist.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(
      403,
      "You are not authorized to remove videos from this playlist"
    );
  }

  /* 
  if (!existingPlaylist.videos.includes(videoId)) {
    throw new ApiError(400, "Video does not exist in the playlist");
  } 
    
  I commented this out because .includes() uses strict equality (===). Since the array contains Mongoose ObjectIds and videoId is a string, it will always return false. Using .some() with .toString() ensures we are comparing two strings.
  */

  const videoInPlaylist = existingPlaylist.videos.some(
    (video) => video.toString() === videoId
  );

  if (!videoInPlaylist) {
    throw new ApiError(400, "Video does not exist in the playlist");
  }

  const playlist = await Playlist.findByIdAndUpdate(
    playlistId,
    { $pull: { videos: videoId } },
    { new: true }
  );

  if (!playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, playlist, "Video removed from playlist successfully")
    );
});

const deletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  const existingPlaylist = await Playlist.findById(playlistId);

  if (!existingPlaylist) {
    throw new ApiError(404, "Playlist not found");
  }

  if (existingPlaylist.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You are not authorized to delete this playlist");
  }

  const deletedPlaylist = await Playlist.findByIdAndDelete(playlistId);

  if (!deletedPlaylist) {
    throw new ApiError(500, "Something went wrong while deleting the playlist");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Playlist deleted successfully"));
});

const updatePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  let { name, description } = req.body;

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  const existingPlaylist = await Playlist.findById(playlistId);

  if (!existingPlaylist) {
    throw new ApiError(404, "Playlist not found");
  }

  if (existingPlaylist.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You are not authorized to update this playlist");
  }

  name = name?.trim();
  description = description?.trim();

  if (!name && !description) {
    throw new ApiError(400, "At least one field is required to update");
  }

  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    { $set: { name, description } },
    { new: true }
  );

  if (!updatedPlaylist) {
    throw new ApiError(500, "Something went wrong while updating the playlist");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedPlaylist, "Playlist updated successfully")
    );
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
};
