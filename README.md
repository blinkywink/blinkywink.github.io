<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Coming Soon</title>
    <link rel="icon" type="image/png" href="icon.png">
    <style>
        body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
        }
        #fullscreen-video {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover; /* Ensures the video covers the entire screen */
        }
    </style>
</head>
<body>
    <video id="fullscreen-video" autoplay muted loop>
        <source src="path/to/your/video.mp4" type="video/mp4">
        <!-- Add more <source> tags for other formats like webm or ogg if needed -->
        Your browser does not support the video tag.
    </video>
</body>
</html>
