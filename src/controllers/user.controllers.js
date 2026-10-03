import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userID) => {
  try {
    const user = await User.findById(userID);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh tokens"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, username, email, password } = req.body;

  if (
    [fullName, username, email, password].some(
      (field) => !field || field.trim() === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existingUser = await User.findOne({ $or: [{ username }, { email }] });

  if (existingUser) {
    if (existingUser.username === username) {
      throw new ApiError(409, "User with this username already exists");
    } else {
      throw new ApiError(409, "User with this email already exists");
    }
  }

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  //   const avatar = await uploadOnCloudinary(avatarLocalPath);
  //   if (!avatar) {
  //     throw new ApiError(400, "Avatar upload failed");
  //   }
  //   let coverImage = "";
  //   if (coverImageLocalPath) {
  //     coverImage = await uploadOnCloudinary(coverImageLocalPath);
  //   }

  let avatar;
  try {
    avatar = await uploadOnCloudinary(avatarLocalPath);
    console.log("Avatar uploaded successfully", avatar);
  } catch (error) {
    console.log("Error uploading avatar", error);
    throw new ApiError(500, "Failed to upload avatar");
  }

  let coverImage;
  if (coverImageLocalPath) {
    try {
      coverImage = await uploadOnCloudinary(coverImageLocalPath);
      console.log("Cover image uploaded successfully", coverImage);
    } catch (error) {
      console.log("Error uploading cover image", error);
      await deleteFromCloudinary(avatar.public_id);
      throw new ApiError(500, "Failed to upload cover image");
    }
  }

  try {
    const user = await User.create({
      fullName,
      username: username.toLowerCase(),
      email,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      password,
    });

    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    if (!createdUser) {
      throw new ApiError(
        500,
        "Something went wrong while registering the user"
      );
    }

    return res
      .status(201)
      .json(new ApiResponse(201, createdUser, "User registered successfully"));
  } catch (error) {
    console.log("User creation failed", error);

    if (avatar) {
      await deleteFromCloudinary(avatar.public_id);
    }

    if (coverImage) {
      await deleteFromCloudinary(coverImage.public_id);
    }

    throw new ApiError(
      500,
      "Something went wrong while registering the user and images were deleted"
    );
  }
});

const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username?.trim() && !email?.trim()) {
    throw new ApiError(400, "Either username or email is required");
  }

  const user = await User.findOne({ $or: [{ username }, { email }] });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Password is incorrect");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!loggedInUser) {
    throw new ApiError(401, "Unable to login user");
  }

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    { $set: { refreshToken: undefined } },
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized access");
  }

  let decodedToken;
  try {
    decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (error) {
    throw new ApiError(401, "Invalid refresh token or token has expired");
  }

  const user = await User.findById(decodedToken?._id);

  if (!user) {
    throw new ApiError(401, "Invalid refresh token");
  }

  if (incomingRefreshToken !== user.refreshToken) {
    throw new ApiError(401, "Refresh token is expired or invalid");
  }

  const options = {
    httpOnly: true,
    secure: true,
  };

  const { accessToken, refreshToken: newRefreshToken } =
    await generateAccessAndRefreshToken(user._id);

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", newRefreshToken, options)
    .json(
      new ApiResponse(
        200,
        { accessToken, refreshToken: newRefreshToken },
        "Access token refreshed successfully"
      )
    );
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordValid = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordValid) {
    throw new ApiError(401, "Old password is incorrect");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  let { fullName, username, email } = req.body;

  if (!fullName?.trim() && !username?.trim() && !email?.trim()) {
    throw new ApiError(400, "At least one field is required to update");
  }

  fullName = fullName?.trim();
  username = username?.trim();
  email = email?.trim();

  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { fullName, username, email } },
    { new: true }
  ).select("-password -refreshToken");

  if (!updatedUser) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedUser, "Account details updated successfully")
    );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  const existingUser = await User.findById(req.user?._id);

  if (!existingUser) {
    throw new ApiError(404, "Existing user not found");
  }

  const oldAvatarUrl = existingUser.avatar;

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(500, "Failed to upload avatar");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { avatar: avatar.url } },
    { new: true }
  ).select("-password -refreshToken");

  if (!updatedUser) {
    throw new ApiError(404, "User not found");
  }

  if (oldAvatarUrl) {
    try {
      const oldPublicId = extractPublicId(oldAvatarUrl);
      await deleteFromCloudinary(oldPublicId);
    } catch (error) {
      console.log("Failed to delete old avatar", error);
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  const existingUser = await User.findById(req.user?._id);

  if (!existingUser) {
    throw new ApiError(404, "Existing user not found");
  }

  const oldCoverImageUrl = existingUser.coverImage;

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(500, "Failed to upload cover image");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { coverImage: coverImage.url } },
    { new: true }
  ).select("-password -refreshToken");

  if (!updatedUser) {
    throw new ApiError(404, "User not found");
  }

  if (oldCoverImageUrl) {
    try {
      const oldPublicId = await extractPublicId(oldCoverImageUrl);
      await deleteFromCloudinary(oldPublicId);
    } catch (error) {
      console.log("Failed to delete old cover image", error);
    }
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedUser, "Cover image updated successfully")
    );
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "Username is required");
  }

  const channel = await User.aggregate([
    {
      $match: { username: username.toLowerCase() },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedChannels",
      },
    },
    {
      $addFields: {
        subscriberCount: { $size: "$subscribers" },
        subscribedChannelCount: { $size: "$subscribedChannels" },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        avatar: 1,
        coverImage: 1,
        subscriberCount: 1,
        subscribedChannelCount: 1,
        isSubscribed: 1,
      },
    },
  ]);

  console.log(channel); // Debugging line to check the channel data

  if (!channel || channel?.length === 0) {
    throw new ApiError(404, "Channel not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "Channel profile fetched successfully")
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?.id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  if (!user?.length) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0]?.watchHistory,
        "Watch history fetched successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
  changeCurrentPassword,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};
