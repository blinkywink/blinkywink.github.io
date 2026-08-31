package co.blinkywink.arcade;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BuiltinMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
