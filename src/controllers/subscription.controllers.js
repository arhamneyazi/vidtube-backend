import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/user.models.js";
import { Subscription } from "../models/subscription.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel ID");
  }

  const channel = await User.findById(channelId);

  if (!channel) {
    throw new ApiError(404, "Channel not found");
  }

  if (channel._id.toString() === req.user?._id.toString()) {
    throw new ApiError(400, "You cannot subscribe to your own channel");
  }

  const existingSubscription = await Subscription.findOne({
    subscriber: req.user?._id,
    channel: channelId,
  });

  if (existingSubscription) {
    await Subscription.findByIdAndDelete(existingSubscription._id);
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Unsubscribed from channel successfully"));
  } else {
    const newSubscription = await Subscription.create({
      subscriber: req.user?._id,
      channel: channelId,
    });
    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          newSubscription,
          "Subscribed to channel successfully"
        )
      );
  }
});

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel ID");
  }

  const subscribers = await Subscription.find({ channel: channelId }).populate(
    "subscriber",
    "fullName username avatar"
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, subscribers, "Subscribers fetched successfully")
    );
});

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;

  if (!isValidObjectId(subscriberId)) {
    throw new ApiError(400, "Invalid subscriber ID");
  }

  const channels = await Subscription.find({
    subscriber: subscriberId,
  }).populate("channel", "fullName username avatar");

  return res
    .status(200)
    .json(
      new ApiResponse(200, channels, "Subscribed channels fetched successfully")
    );
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
