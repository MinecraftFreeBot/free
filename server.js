const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const mime = require("mime");

const app = express();
const PORT = 4444;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

// Define MKV MIME type explicitly
mime.define({ "video/x-matroska": ["mkv"] }, true);

// Serve videos with proper Content-Type to prevent download
app.use("/videos", (req, res, next) => {
  const filePath = path.join(__dirname, "public", "videos", req.path);
  if (fs.existsSync(filePath)) {
    const type = mime.getType(filePath) || "application/octet-stream";
    res.type(type);
    res.sendFile(filePath);
  } else {
    next();
  }
});

// Serve thumbnails & static assets normally
app.use(
  "/thumbnails",
  express.static(path.join(__dirname, "public", "thumbnails"))
);
app.use(express.static(path.join(__dirname, "public")));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./public/videos"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, baseName + "-" + Date.now() + ext);
  },
});

// Upload config: max 10GB, allow mkv, mp4, webm, mov, avi
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "video/mp4",
      "video/x-matroska", // mkv
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
    ];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only video files (mp4, mkv, webm, mov, avi) allowed!"));
  },
});

// Get all videos info to render homepage
function getVideos() {
  const videoDir = path.join(__dirname, "public", "videos");
  const thumbnailDir = path.join(__dirname, "public", "thumbnails");

  if (!fs.existsSync(videoDir)) return [];

  const files = fs
    .readdirSync(videoDir)
    .filter((f) => /\.(mp4|mkv|webm|mov|avi)$/i.test(f));

  return files.map((filename) => {
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
}

// Homepage route
app.get("/", (req, res) => {
  const videos = getVideos();
  res.render("index", { videos });
});

// Upload route
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).send("No video uploaded");

  const videoPath = req.file.path;
  const thumbnailDir = path.join(__dirname, "public", "thumbnails");
  if (!fs.existsSync(thumbnailDir)) fs.mkdirSync(thumbnailDir);

  // Generate thumbnail (1 screenshot 320x240)
  ffmpeg(videoPath)
    .screenshots({
      count: 1,
      folder: thumbnailDir,
      filename: req.file.filename + ".png",
      size: "320x240",
    })
    .on("end", () => {
      res.status(200).send("Upload successful");
    })
    .on("error", (err) => {
      console.error("Thumbnail error:", err);
      res.status(200).send("Upload successful (thumbnail failed)");
    });
});

// Delete route
app.post("/delete", express.urlencoded({ extended: true }), (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).send("Missing filename");

  const videoPath = path.join(__dirname, "public", "videos", filename);
  const thumbnailPath = path.join(
    __dirname,
    "public",
    "thumbnails",
    filename + ".png"
  );

  if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);

  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
