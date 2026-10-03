import { Router } from "express";
import {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
} from "../controllers/video.controllers.js";
import { upload } from "../middlewares/multer.middlewares.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

const router = Router();

router.route("/").get(getAllVideos);

router.route("/publish-video").post(
  verifyJWT,
  upload.fields([
    {
      name: "videoFile",
      maxCount: 1,
    },
    {
      name: "thumbnail",
      maxCount: 1,
    },
  ]),
  publishAVideo
);

router.route("/toggle/publish/:videoId").patch(verifyJWT, togglePublishStatus);

router
  .route("/:videoId")
  .get(getVideoById)
  .patch(verifyJWT, upload.single("thumbnail"), updateVideo)
  .delete(verifyJWT, deleteVideo);

export default router;
