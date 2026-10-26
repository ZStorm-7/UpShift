// Quicker ways to log food: recent foods and saved meals, a barcode scanner, and a photo of the plate.

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { spacing, radius, layout } from '../../theme/tokens';
import { fontFamily } from '../../theme/fonts';
import { usePalette } from '../../theme/themedColors';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button } from '../ui';
import { lookupBarcode, scaleFood, type ScannedFood, type LookupError } from '../../services/food/barcode';
import { mealTotals, type FoodItem, type SavedMeal } from '../../services/food/library';
import { analyzeMealPhoto, CoachError } from '../../services/coach';
import haptics from '../../services/haptics';

const fill = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((a, [k, v]) => a.split(`{${k}}`).join(String(v)), s);

// expo-camera is a native module: if it isn't in the build (or on the web without a camera) the
// scanner simply offers typing the number instead.
let CameraModule: any = null;
try { CameraModule = require('expo-camera'); } catch { CameraModule = null; }

/* ---------------------------------------------------------------- *
 * Recent foods + saved meals, shown when the search box is empty
 * ---------------------------------------------------------------- */
export function FoodLibraryPanel({ recent, saved, onLog, onLogMeal, onRemoveMeal }: {
  recent: FoodItem[]; saved: SavedMeal[]; onLog: (f: FoodItem) => void; onLogMeal: (m: SavedMeal) => void; onRemoveMeal: (m: SavedMeal) => void;
}) {
  const palette = usePalette();
  const { t } = useLanguage();
  return (
    <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
      {saved.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.head, { color: palette.textMuted }]}>{t('fdSavedMeals').toUpperCase()}</Text>
          {saved.map(m => {
            const tot = mealTotals(m.items);
            return (
              <View key={m.id} style={[styles.row, { borderBottomColor: palette.divider }]}>
                <Pressable onPress={() => onLogMeal(m)} accessibilityRole="button" accessibilityLabel={`${t('fdLogAll')}: ${m.name}`} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                  <Text style={[styles.name, { color: palette.textPrimary }]}>{m.name}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>{fill(t('fdItems'), { n: m.items.length })} · {Math.round(tot.calories)} kcal</Text>
                </Pressable>
                <Pressable onPress={() => onRemoveMeal(m)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${t('fdRemoveMeal')}: ${m.name}`} style={styles.x}>
                  <Text style={{ color: palette.textMuted }}>✕</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
      <View style={{ gap: spacing.xs }}>
        <Text style={[styles.head, { color: palette.textMuted }]}>{t('fdRecent').toUpperCase()}</Text>
        {recent.length === 0 && <Text style={[styles.meta, { color: palette.textMuted }]}>{t('fdNoRecent')}</Text>}
        {recent.map((f, i) => (
          <Pressable key={`${f.name}-${i}`} onPress={() => onLog(f)} accessibilityRole="button" accessibilityLabel={`${f.name}, ${Math.round(f.calories)} kcal`}
            style={[styles.row, { borderBottomColor: palette.divider, minHeight: 44 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: palette.textPrimary }]}>{f.name}</Text>
              <Text style={[styles.meta, { color: palette.textMuted }]}>{Math.round(f.calories)} kcal · P {f.protein} · C {f.carbs} · F {f.fat}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- *
 * Barcode sheet
 * ---------------------------------------------------------------- */
export function BarcodeSheet({ visible, onClose, onLog }: { visible: boolean; onClose: () => void; onLog: (f: FoodItem) => void }) {
  const palette = usePalette();
  const { t } = useLanguage();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LookupError | null>(null);
  const [food, setFood] = useState<ScannedFood | null>(null);
  const [servings, setServings] = useState(1);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const lastScan = useRef('');

  useEffect(() => { if (!visible) { setCode(''); setFood(null); setError(null); setServings(1); setCameraOn(false); lastScan.current = ''; } }, [visible]);

  const lookup = useCallback(async (value: string) => {
    setBusy(true); setError(null); setFood(null);
    const r = await lookupBarcode(value);
    setBusy(false);
    if (r.ok) { setFood(r.food); setServings(1); setCameraOn(false); haptics.setComplete(); } else { setError(r.error); haptics.error(); }
  }, []);

  async function toggleCamera() {
    if (cameraOn) { setCameraOn(false); return; }
    try {
      const perm = await CameraModule.Camera.requestCameraPermissionsAsync();
      if (!perm.granted) { setCameraDenied(true); return; }
      setCameraDenied(false); lastScan.current = ''; setCameraOn(true);
    } catch { setCameraDenied(true); }
  }

  const errText: Record<LookupError, string> = { invalid: t('fdErrInvalid'), notfound: t('fdErrNotFound'), network: t('fdErrNetwork'), nonutrition: t('fdErrNoNutrition') };
  const scaled = food ? scaleFood(food, servings) : null;
  const CameraView = CameraModule?.CameraView;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityLabel={t('fdScanBarcode')}>
      <View style={[styles.overlay, { backgroundColor: palette.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>{t('fdScanBarcode')}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('cancel')}><Text style={{ color: palette.textSecondary, fontFamily: fontFamily.sansBold }}>✕</Text></Pressable>
          </View>
          <Text style={[styles.meta, { color: palette.textSecondary }]}>{t('fdBarcodeHint')}</Text>
          {cameraOn && CameraView && (
            <View style={styles.camera}>
              <CameraView style={StyleSheet.absoluteFill} facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                onBarcodeScanned={(e: { data: string }) => { if (e.data && e.data !== lastScan.current) { lastScan.current = e.data; setCode(e.data); lookup(e.data); } }} />
            </View>
          )}
          {cameraDenied && <Text style={[styles.meta, { color: palette.warning }]}>{t('fdCameraDenied')}</Text>}
          {!!CameraView && Platform.OS !== 'web' && <Button label={cameraOn ? t('fdStopCamera') : t('fdUseCamera')} variant="secondary" size="sm" onPress={toggleCamera} />}
          <TextInput value={code} onChangeText={v => setCode(v.replace(/[^0-9 -]/g, '').slice(0, 20))} placeholder={t('fdBarcodeInput')} placeholderTextColor={palette.textMuted}
            keyboardType="number-pad" accessibilityLabel={t('fdBarcodeInput')} onSubmitEditing={() => code && lookup(code)} returnKeyType="search"
            style={[styles.input, { color: palette.textPrimary, borderColor: palette.border, backgroundColor: palette.surfaceRaised }]} />
          <Button label={busy ? '…' : t('fdLookUp')} onPress={() => lookup(code)} disabled={!code.trim() || busy} />
          {busy && <ActivityIndicator color={palette.accent} />}
          {!!error && <Text style={[styles.err, { color: palette.danger }]} accessibilityRole="alert">{errText[error]}</Text>}
          {food && scaled && (
            <View style={[styles.result, { borderColor: palette.border, backgroundColor: palette.surfaceSunken }]}>
              <Text style={[styles.name, { color: palette.textPrimary }]}>{scaled.name}</Text>
              <Text style={[styles.meta, { color: palette.textMuted }]}>{fill(t('fdPer'), { s: food.servingLabel })}: {food.calories} kcal · P {food.protein} · C {food.carbs} · F {food.fat}</Text>
              <View style={styles.stepRow}>
                <Text style={[styles.meta, { color: palette.textSecondary }]}>{t('fdServings')}</Text>
                {[0.5, 1, 1.5, 2, 3].map(s => (
                  <Pressable key={s} onPress={() => setServings(s)} accessibilityRole="button" accessibilityState={{ selected: servings === s }} accessibilityLabel={`${t('fdServings')} ${s}`}
                    style={[styles.chip, { borderColor: servings === s ? palette.accent : palette.border, backgroundColor: servings === s ? palette.accentSoft : 'transparent' }]}>
                    <Text style={{ color: palette.textPrimary, fontFamily: fontFamily.sansBold, fontSize: 13 }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.name, { color: palette.textPrimary }]}>{scaled.calories} kcal · P {scaled.protein} · C {scaled.carbs} · F {scaled.fat}</Text>
              <Button label={t('fdLogIt')} onPress={() => { onLog(scaled); onClose(); }} />
            </View>
          )}
          <Text style={[styles.credit, { color: palette.textMuted }]}>{t('fdDataFrom')}</Text>
        </View>
      </View>
    </Modal>
  );
}

/* ---------------------------------------------------------------- *
 * Photo sheet: take or choose a photo, the AI coach reads it, one tap logs it
 * ---------------------------------------------------------------- */
export function PhotoLogSheet({ visible, onClose, onLog }: { visible: boolean; onClose: () => void; onLog: (items: FoodItem[]) => void }) {
  const palette = usePalette();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<FoodItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!visible) { setItems(null); setError(''); setBusy(false); } }, [visible]);

  async function pick(camera: boolean) {
    setError(''); setItems(null);
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const asset = res.canceled ? null : res.assets?.[0];
      if (!asset?.base64) return;
      setBusy(true);
      const r = await analyzeMealPhoto(asset.base64, asset.mimeType || 'image/jpeg');
      const found = r.card && r.card.kind === 'meal' ? r.card.items : [];
      if (found.length === 0) setError(t('fdPhotoErr')); else { setItems(found); haptics.setComplete(); }
    } catch (e) {
      const code = e instanceof CoachError ? e.code : '';
      setError(code === 'consent' ? t('fdPhotoErrConsent') : code === 'quota' ? t('fdPhotoErrLimit') : code === 'offline' ? t('fdErrNetwork') : t('fdPhotoErr'));
      haptics.error();
    } finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityLabel={t('fdPhoto')}>
      <View style={[styles.overlay, { backgroundColor: palette.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>{t('fdPhoto')}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('cancel')}><Text style={{ color: palette.textSecondary, fontFamily: fontFamily.sansBold }}>✕</Text></Pressable>
          </View>
          <Text style={[styles.meta, { color: palette.textSecondary }]}>{t('fdPhotoNote')}</Text>
          {Platform.OS !== 'web' && <Button label={t('fdPhotoCamera')} onPress={() => pick(true)} disabled={busy} />}
          <Button label={t('fdPhotoLibrary')} variant={Platform.OS === 'web' ? 'primary' : 'secondary'} onPress={() => pick(false)} disabled={busy} />
          {busy && (<View style={{ alignItems: 'center', gap: spacing.sm }}><ActivityIndicator color={palette.accent} /><Text style={[styles.meta, { color: palette.textMuted }]}>{t('fdAnalyzing')}</Text></View>)}
          {!!error && <Text style={[styles.err, { color: palette.danger }]} accessibilityRole="alert">{error}</Text>}
          {items && (
            <View style={[styles.result, { borderColor: palette.border, backgroundColor: palette.surfaceSunken }]}>
              <Text style={[styles.meta, { color: palette.textSecondary }]}>{t('fdPhotoResult')}</Text>
              {items.map((f, i) => (<Text key={i} style={[styles.name, { color: palette.textPrimary }]}>{f.name}: {Math.round(f.calories)} kcal · P {f.protein} · C {f.carbs} · F {f.fat}</Text>))}
              <Button label={t('fdLogAll')} onPress={() => { onLog(items); onClose(); }} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs },
  name: { fontFamily: fontFamily.sansBold, fontSize: 14 },
  meta: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 17 },
  x: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: layout.hairline, borderBottomWidth: 0, padding: spacing.lg, gap: spacing.md, maxHeight: '90%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontFamily: fontFamily.serif, fontSize: 22 },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: layout.hairline, paddingHorizontal: spacing.md, fontFamily: fontFamily.sansBold, fontSize: 18, letterSpacing: 1 },
  err: { fontFamily: fontFamily.sansBold, fontSize: 13 },
  result: { borderRadius: radius.md, borderWidth: layout.hairline, padding: spacing.md, gap: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { minWidth: 44, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  camera: { height: 200, borderRadius: radius.md, overflow: 'hidden' },
  credit: { fontFamily: fontFamily.sans, fontSize: 11, textAlign: 'center' },
});
