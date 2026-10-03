import { Router } from "express";
import {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
} from "../controllers/playlist.controllers.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

const router = Router();

router.route("/").post(verifyJWT, createPlaylist);

router
  .route("/:playlistId")
  .get(getPlaylistById)
  .patch(verifyJWT, updatePlaylist)
  .delete(verifyJWT, deletePlaylist);

router.route("/add/:playlistId/:videoId").patch(verifyJWT, addVideoToPlaylist);

router
  .route("/remove/:playlistId/:videoId")
  .patch(verifyJWT, removeVideoFromPlaylist);

router.route("/user/:userId").get(getUserPlaylists);

export default router;
