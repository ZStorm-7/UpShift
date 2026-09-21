// BarcodeScanner — full-screen camera modal for scanning a packaged food's
// barcode from the Nutrition screen's "Log Food" flow, instead of typing its
// name into search.
//
// A separate component (not folded into NutritionScreen) because a camera
// preview has its own lifecycle concerns — permission state, mount/unmount,
// only one active scan at a time — that would otherwise tangle with the
// screen's food-search state.

import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radius, type } from '../theme/tokens';
import { Palette } from '../theme/themedColors';
import { Button } from './ui';
import { easing } from '../animation/motion';
import haptics from '../services/haptics';
import { lookupBarcode } from '../data/barcodeApi';
import { FoodDatabaseItem } from '../data/foods';

// Retail food packaging is universally one of these — UPC-A/UPC-E in the US,
// EAN-13/EAN-8 everywhere else. Restricting to just these (rather than every
// type the scanner supports, like QR or PDF417) means a stray QR code on the
// same box — nutrition apps, ad campaigns, whatever — can't get mistaken for
// the product's own barcode.
const FOOD_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

type BarcodeScannerProps = {
  visible: boolean;
  onClose: () => void;
  onFound: (item: FoodDatabaseItem) => void;
  palette: Palette;
};

export default function BarcodeScanner({ visible, onClose, onFound, palette }: BarcodeScannerProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [status, setStatus] = useState<'scanning' | 'looking-up' | 'found' | 'not-found'>('scanning');
  const [foundName, setFoundName] = useState('');
  // Guards against the same barcode firing onBarcodeScanned a dozen times a
  // second while it's still in frame, and against a second scan starting
  // while the first is still looking a product up.
  const lockedRef = useRef(false);
  const foundScale = useSharedValue(0.6);
  const foundOpacity = useSharedValue(0);
  const foundStyle = useAnimatedStyle(() => ({
    opacity: foundOpacity.value,
    transform: [{ scale: foundScale.value }],
  }));

  useEffect(() => {
    if (visible) {
      setStatus('scanning');
      setTorch(false);
      lockedRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission]);

  async function handleScanned({ data }: BarcodeScanningResult) {
    if (lockedRef.current) return;
    lockedRef.current = true;
    haptics.selection();
    setStatus('looking-up');
    const item = await lookupBarcode(data);
    if (item) {
      haptics.goalMet();
      setFoundName(item.name);
      setStatus('found');
      foundScale.value = 0.6;
      foundOpacity.value = 0;
      foundScale.value = withTiming(1, { duration: 300, easing: easing.standard });
      foundOpacity.value = withTiming(1, { duration: 220, easing: easing.standard });
      // A beat to actually see the confirmation before the scanner closes —
      // onFound unmounts this component (the parent flips `visible` off and
      // adds the item), so anything faster would read as the scan being cut
      // off rather than confirmed.
      setTimeout(() => onFound(item), 650);
    } else {
      haptics.selection();
      setStatus('not-found');
      // Give the "not found" state a moment to register before letting the
      // next barcode in frame retry — otherwise a product this database
      // doesn't have would flash "not found" once per frame indefinitely.
      setTimeout(() => {
        lockedRef.current = false;
        setStatus('scanning');
      }, 1800);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODE_TYPES] }}
            onBarcodeScanned={status === 'scanning' ? handleScanned : undefined}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.permissionFallback]} />
        )}

        {/* Scrim + frame overlay sit above the preview either way, so the
            "grant permission" copy has the same dark backdrop as a live
            scan rather than looking like a different screen. */}
        <View style={[styles.overlay, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.topBar}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close scanner">
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.topBarTitle}>Scan barcode</Text>
            {permission?.granted ? (
              <Pressable
                onPress={() => setTorch(t => !t)}
                hitSlop={12}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={torch ? 'Turn off torch' : 'Turn on torch'}>
                <Ionicons name={torch ? 'flash' : 'flash-off'} size={22} color="#fff" />
              </Pressable>
            ) : (
              <View style={styles.iconButton} />
            )}
          </View>

          {permission?.granted ? (
            status === 'found' ? (
              <View style={styles.frameWrap}>
                <Animated.View style={[styles.foundBadge, foundStyle]}>
                  <Ionicons name="checkmark-circle" size={56} color={palette.accent} />
                </Animated.View>
                <Animated.Text style={[styles.hint, styles.foundName, foundStyle]} numberOfLines={2}>
                  {foundName}
                </Animated.Text>
              </View>
            ) : (
              <>
                <View style={styles.frameWrap}>
                  <View style={[styles.frame, status === 'not-found' && styles.frameError]} />
                  <Text style={styles.hint}>
                    {status === 'looking-up' ? 'Looking it up…'
                      : status === 'not-found' ? "Couldn't find that product — try search instead"
                      : "Line up the barcode inside the box"}
                  </Text>
                </View>
                {status === 'looking-up' && <ActivityIndicator color="#fff" style={{ marginTop: spacing.md }} />}
              </>
            )
          ) : (
            <View style={styles.permissionPrompt}>
              <Ionicons name="camera-outline" size={40} color="#fff" />
              <Text style={styles.permissionTitle}>Camera access needed</Text>
              <Text style={styles.permissionBody}>
                UpShift needs your camera to scan a food's barcode.
              </Text>
              <Button label="Grant permission" onPress={requestPermission} variant="primary" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionFallback: {
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    ...type.heading,
    color: '#fff',
  },
  frameWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  frame: {
    width: '78%',
    aspectRatio: 1.7,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: '#fff',
  },
  frameError: {
    borderColor: '#FF4B55',
  },
  hint: {
    ...type.body,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },
  foundBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  foundName: {
    ...type.heading,
    fontSize: 17,
  },
  // Anchored a third of the way down rather than dead-centered in the full
  // remaining height — there's no camera feed behind this state (permission
  // hasn't been granted yet), so centering in the whole flex:1 area left a
  // block of content floating in a mostly-empty black screen. Grouped near
  // the top instead, like any other permission-request screen.
  permissionPrompt: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingTop: '18%',
  },
  permissionTitle: {
    ...type.titleSemi,
    color: '#fff',
    marginTop: spacing.sm,
  },
  permissionBody: {
    ...type.body,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
