const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const PORT = 4444;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

// Static folders
app.use("/videos", express.static(path.join(__dirname, "public", "videos")));
app.use(
  "/thumbnails",
  express.static(path.join(__dirname, "public", "thumbnails"))
);
app.use(express.static(path.join(__dirname, "public")));

// Allowed video extensions
const allowedExtensions = [".mp4", ".mkv", ".webm", ".mov", ".avi"];

// Multer setup for uploads with 10GB limit
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./public/videos"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, baseName + "-" + Date.now() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith("video/") && allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only video files with extensions mp4, mkv, webm, mov, avi are allowed!"
        )
      );
    }
  },
});

// Helper: get all videos info (filename, url, thumbnail)
function getVideos() {
  const videoDir = path.join(__dirname, "public", "videos");
  const thumbnailDir = path.join(__dirname, "public", "thumbnails");

  if (!fs.existsSync(videoDir)) return [];

  const files = fs.readdirSync(videoDir);
  const videos = files
    .filter((f) => allowedExtensions.includes(path.extname(f).toLowerCase()))
    .map((filename) => {
      const name = filename
        .replace(/[-_]\d+$/, "")
        .replace(path.extname(filename), "");
      const thumbnailPath = path.join(thumbnailDir, filename + ".png");
      const thumbnailExists = fs.existsSync(thumbnailPath);

      return {
        filename,
        name,
        url: "/videos/" + filename,
        thumbnail: thumbnailExists
          ? "/thumbnails/" + filename + ".png"
          : "/fallback-thumbnail.png",
      };
    });
  return videos;
}

// Home page: show upload form + videos grid
app.get("/", (req, res) => {
  const videos = getVideos();
  res.render("index", { videos });
});

// Upload handler
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).send("No video uploaded");

  const videoPath = req.file.path;
  const thumbnailPath = path.join(
    __dirname,
    "public",
    "thumbnails",
    req.file.filename + ".png"
  );

  // Generate thumbnail
  ffmpeg(videoPath)
    .screenshots({
      count: 1,
      folder: path.join(__dirname, "public", "thumbnails"),
      filename: req.file.filename + ".png",
      size: "320x240",
    })
    .on("end", () => {
      console.log("Thumbnail created:", thumbnailPath);
      res.redirect("/");
    })
    .on("error", (err) => {
      console.error("Error creating thumbnail:", err);
      res.redirect("/");
    });
});

// Delete video and thumbnail
app.post("/delete", (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).send("Missing filename");

  const videoPath = path.join(__dirname, "public", "videos", filename);
  const thumbnailPath = path.join(
    __dirname,
    "public",
    "thumbnails",
    filename + ".png"
  );

  if (fs.existsSync(videoPath)) {
    fs.unlinkSync(videoPath);
  }

  if (fs.existsSync(thumbnailPath)) {
    fs.unlinkSync(thumbnailPath);
  }

  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
