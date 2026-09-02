package co.blinkywink.arcade;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BuiltinMediaPlugin.class);
        super.onCreate(savedInstanceState);
        installMediaClient();
    }

    @Override
    public void onStart() {
        super.onStart();
        installMediaClient();
    }

    private void installMediaClient() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        /* Same Chromium stack as mobile Chrome — keep GPU compositing enabled for card 3D/FX. */
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        webView.getSettings().setOffscreenPreRaster(true);
        webView.setWebViewClient(
                new BridgeWebViewClient(getBridge()) {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(
                        WebView view,
                        WebResourceRequest request
                    ) {
                        WebResourceResponse media =
                            BuiltinMediaPlugin.serveAsset(getAssets(), request);
                        if (media != null) return media;
                        return super.shouldInterceptRequest(view, request);
                    }
                }
            );
    }
}
