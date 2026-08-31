package co.blinkywink.arcade;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BuiltinMedia")
public class BuiltinMediaPlugin extends Plugin {
    @PluginMethod
    public void getMediaBase(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("base", "file:///android_asset/public");
        call.resolve(ret);
    }
}
