package co.blinkywink.arcade;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "BuiltinMedia")
public class BuiltinMediaPlugin extends Plugin {
    @PluginMethod
    public void getMediaBase(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("base", "");
        ret.put("mode", "asset-intercept");
        call.resolve(ret);
    }

    /**
     * Serve IPA/APK art from android_asset even after Capgo swaps the web dir.
     * Path is public/images|sounds|music/... inside assets.
     */
    static WebResourceResponse serveAsset(AssetManager assets, WebResourceRequest request) {
        if (assets == null || request == null || request.getUrl() == null) return null;
        Uri uri = request.getUrl();
        String path = uri.getPath();
        if (path == null || path.contains("..")) return null;

        String assetPath = assetPathFor(path);
        if (assetPath == null) return null;

        try {
            InputStream in = assets.open(assetPath);
            String mime = mimeFor(assetPath);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "public, max-age=31536000, immutable");
            headers.put("Access-Control-Allow-Origin", "*");
            return new WebResourceResponse(mime, null, 200, "OK", headers, in);
        } catch (IOException e) {
            return null;
        }
    }

    private static String assetPathFor(String path) {
        String rel = path;
        String marker = "/android_asset/public";
        int cut = path.indexOf(marker);
        if (cut >= 0) {
            rel = path.substring(cut + marker.length());
            if (rel.isEmpty()) rel = "/";
        }
        if (!(rel.startsWith("/images/")
                || rel.startsWith("/sounds/")
                || rel.startsWith("/music/"))) {
            return null;
        }
        return "public" + rel;
    }

    private static String mimeFor(String assetPath) {
        String lower = assetPath.toLowerCase();
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".webm")) return "video/webm";
        return "application/octet-stream";
    }
}
