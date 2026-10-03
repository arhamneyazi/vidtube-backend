import { Router } from "express";
import {
  createTweet,
  deleteTweet,
  getUserTweets,
  updateTweet,
} from "../controllers/tweet.controllers.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

const router = Router();

router.route("/user/:userId").get(getUserTweets);

router.use(verifyJWT); // Apply verifyJWT middleware to all routes below this line

router.route("/").post(createTweet);
router.route("/:tweetId").patch(updateTweet).delete(deleteTweet);

export default router;
