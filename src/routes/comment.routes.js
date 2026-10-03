import { Router } from "express";
import {
  addComment,
  deleteComment,
  getVideoComments,
  updateComment,
} from "../controllers/comment.controllers.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

const router = Router();

router.route("/:videoId").get(getVideoComments);

router.use(verifyJWT); // Apply verifyJWT middleware to all routes below this line

router.route("/:videoId").post(addComment);
router.route("/c/:commentId").delete(deleteComment).patch(updateComment);

export default router;
