import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import NetInfo from "@react-native-community/netinfo";
import React, { useEffect, useMemo, useState } from "react";
import {
  AppState,
  Alert,
  Button,
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { CHECKLIST_ITEMS, DEFAULT_CHECKLIST } from "./src/config";
import {
  fetchAssetHours,
  fetchAssets,
  fetchManagerAudit,
  getApiBaseUrl,
  pingServerHealth,
  setApiBaseUrl,
  submitManagerDamageReport,
  submitManagerInspection
} from "./src/api";
import { getQueue, getSavedApiBase, saveApiBase } from "./src/storage";
import { queueDamageReport, queueInspection, syncQueue } from "./src/sync";
import { toUploadPhotos } from "./src/photo";
import { API_BASE_URL } from "./src/config";

const STATUS_VALUES = ["ok", "attention", "unsafe"];

function buildDefaultCheckDetails() {
  return Object.fromEntries(
    CHECKLIST_ITEMS.map((item) => [
      item.key,
      {
        comment: "",
        photos: []
      }
    ])
  );
}

function ChecklistToggle({ label, value, onChange }) {
  return (
    <View
      style={[
        styles.checkRow,
        value === "unsafe" && styles.checkRowUnsafe,
        value === "attention" && styles.checkRowAttention,
        value === "ok" && styles.checkRowOk
      ]}
    >
      <Text style={styles.checkLabel}>{label}</Text>
      <View style={styles.statusButtons}>
        {STATUS_VALUES.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => onChange(s)}
            style={[
              styles.statusBtn,
              value === s && styles[`statusBtn_${s}`]
            ]}
          >
            <Text style={styles.statusBtnText}>{s.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("inspection");
  const [managerName, setManagerName] = useState("");
  const [managerSignature, setManagerSignature] = useState("");
  const [notes, setNotes] = useState("");
  const [hourMeter, setHourMeter] = useState("");
  const [assets, setAssets] = useState([]);
  const [assetQuery, setAssetQuery] = useState("");
  const [showAssetResults, setShowAssetResults] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [currentHours, setCurrentHours] = useState("0.0");
  const [checklist, setChecklist] = useState({ ...DEFAULT_CHECKLIST });
  const [checkDetails, setCheckDetails] = useState(buildDefaultCheckDetails());
  const [isOnline, setIsOnline] = useState(false);
  const [syncState, setSyncState] = useState({ sent: 0, failed: 0, remaining: 0 });
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, stage: "idle" });
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [damageLocation, setDamageLocation] = useState("");
  const [damageSeverity, setDamageSeverity] = useState("medium");
  const [damageDescription, setDamageDescription] = useState("");
  const [damageImmediateAction, setDamageImmediateAction] = useState("");
  const [damageOutOfService, setDamageOutOfService] = useState(false);
  const [damagePhotos, setDamagePhotos] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [apiBaseInput, setApiBaseInput] = useState(API_BASE_URL);

  const selectedAssetName = useMemo(() => {
    const a = assets.find((x) => x.id === selectedAsset);
    return a ? `${a.asset_code || ""} ${a.asset_name || ""}`.trim() : "None";
  }, [assets, selectedAsset]);

  const filteredAssets = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    const base = assets || [];
    if (!q) return [];
    return base
      .filter((a) => {
        const code = String(a.asset_code || "").toLowerCase();
        const name = String(a.asset_name || "").toLowerCase();
        return code.includes(q) || name.includes(q);
      })
      .slice(0, 30);
  }, [assets, assetQuery]);

  async function refreshQueueCount() {
    const queue = await getQueue();
    setSyncState((prev) => ({ ...prev, remaining: queue.length }));
  }

  async function runSync(forceOnline = null) {
    const online = typeof forceOnline === "boolean" ? forceOnline : isOnline;
    const result = await syncQueue({
      isOnline: online,
      onProgress: (p) => setSyncProgress(p)
    });
    setSyncState(result);
    if (online && (result.sent > 0 || result.total > 0 || result.remaining === 0)) {
      setLastSyncAt(new Date().toISOString());
    }
    if (!result.total) {
      setSyncProgress({ current: 0, total: 0, stage: "idle" });
    }
    return result;
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const saved = await getSavedApiBase();
        const nextBase = setApiBaseUrl(saved || API_BASE_URL);
        if (!cancelled) setApiBaseInput(nextBase);
      } catch {
        if (!cancelled) setApiBaseInput(setApiBaseUrl(API_BASE_URL));
      }
      if (cancelled) return;
      refreshQueueCount();
      fetchAssets()
        .then((rows) => setAssets(Array.isArray(rows) ? rows : []))
        .catch((err) =>
          Alert.alert(
            "Assets load failed",
            `Server: ${getApiBaseUrl()}\n${err?.message || String(err)}`
          )
        );
      loadAudit().catch(() => null);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSaveApiBase() {
    const applied = setApiBaseUrl(apiBaseInput);
    setApiBaseInput(applied);
    await saveApiBase(applied);
    setSelectedAsset(null);
    setAssetQuery("");
    setAssets([]);
    try {
      const rows = await fetchAssets();
      setAssets(Array.isArray(rows) ? rows : []);
      await loadAudit();
      Alert.alert("Server updated", `Using ${applied}`);
    } catch (err) {
      Alert.alert("Server saved", `${applied}\n\nCould not connect now: ${err.message || "Unknown error"}`);
    }
  }

  async function onTestServerHealth() {
    const applied = setApiBaseUrl(apiBaseInput);
    setApiBaseInput(applied);
    try {
      const data = await pingServerHealth();
      Alert.alert("Server health OK", `${applied}\n\nResponse: ${JSON.stringify(data)}`);
    } catch (err) {
      Alert.alert(
        "Server health failed",
        `${applied}\n\n${err?.message || "Could not reach /health"}`
      );
    }
  }

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) {
        runSync(true).catch(() => null);
      }
    });
    return () => unsub();
  }, [isOnline]);

  // Auto-sync loop while app is open and online.
  useEffect(() => {
    const timer = setInterval(() => {
      if (isOnline) {
        runSync(true).catch(() => null);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [isOnline]);

  // Sync immediately when app returns to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && isOnline) {
        runSync(true).catch(() => null);
      }
    });
    return () => sub.remove();
  }, [isOnline]);

  async function onSelectAsset(assetId) {
    setSelectedAsset(assetId);
    const selected = assets.find((a) => a.id === assetId);
    if (selected) {
      setAssetQuery(`${selected.asset_code || ""} ${selected.asset_name || ""}`.trim());
    }
    setShowAssetResults(false);
    try {
      const data = await fetchAssetHours(assetId);
      const h = Number(data?.current_hours ?? data?.total_hours ?? 0);
      setCurrentHours(h.toFixed(1));
      setHourMeter(h.toFixed(1));
    } catch {
      setCurrentHours("0.0");
    }
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Camera permission is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5
    });
    return !result.canceled && result.assets?.length ? result.assets[0] : null;
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      quality: 0.5,
      selectionLimit: 8
    });
    if (!result.canceled && result.assets?.length) {
      return result.assets
        .filter((a) => a.uri)
        .map((a) => ({
          uri: a.uri,
          mimeType: a.mimeType || "image/jpeg"
        }));
    }
    return [];
  }

  async function addPhotoToCheck(itemKey, source = "camera") {
    const current = checkDetails[itemKey]?.photos || [];
    if (current.length >= 3) {
      Alert.alert("Limit", "Maximum 3 photos per checklist item.");
      return;
    }

    if (source === "camera") {
      const asset = await pickFromCamera();
      if (!asset?.uri) return;
      const photo = { uri: asset.uri, mimeType: asset.mimeType || "image/jpeg" };
      setCheckDetails((prev) => ({
        ...prev,
        [itemKey]: {
          ...(prev[itemKey] || { comment: "", photos: [] }),
          photos: [...(prev[itemKey]?.photos || []), photo].slice(0, 3)
        }
      }));
      return;
    }

    const gallery = await pickFromGallery();
    if (!gallery.length) return;
    setCheckDetails((prev) => ({
      ...prev,
      [itemKey]: {
        ...(prev[itemKey] || { comment: "", photos: [] }),
        photos: [...(prev[itemKey]?.photos || []), ...gallery].slice(0, 3)
      }
    }));
  }

  async function addPhotoToDamage(source = "camera") {
    if ((damagePhotos || []).length >= 8) {
      Alert.alert("Limit", "Maximum 8 photos for damage report.");
      return;
    }
    if (source === "camera") {
      const asset = await pickFromCamera();
      if (!asset?.uri) return;
      setDamagePhotos((prev) => [...prev, { uri: asset.uri, mimeType: asset.mimeType || "image/jpeg" }].slice(0, 8));
      return;
    }
    const gallery = await pickFromGallery();
    if (!gallery.length) return;
    setDamagePhotos((prev) => [...prev, ...gallery].slice(0, 8));
  }

  async function onSaveInspection() {
    if (isBusy) return;
    if (!managerName.trim()) return Alert.alert("Validation", "Enter manager name.");
    if (!managerSignature.trim()) return Alert.alert("Validation", "Enter manager signature.");
    if (!selectedAsset) return Alert.alert("Validation", "Select an asset.");

    const requiredCommentMissing = CHECKLIST_ITEMS.find((item) => {
      const status = checklist[item.key];
      const comment = String(checkDetails[item.key]?.comment || "").trim();
      return (status === "attention" || status === "unsafe") && !comment;
    });
    if (requiredCommentMissing) {
      return Alert.alert(
        "Validation",
        `${requiredCommentMissing.label}: comment is required when status is ATTENTION or UNSAFE.`
      );
    }

    setIsBusy(true);
    try {
      const checklist_details = Object.fromEntries(
        CHECKLIST_ITEMS.map((item) => {
          const d = checkDetails[item.key] || { comment: "", photos: [] };
          return [
            item.key,
            {
              comment: String(d.comment || "").trim(),
              photo_count: Array.isArray(d.photos) ? d.photos.length : 0
            }
          ];
        })
      );
      const checklistLines = CHECKLIST_ITEMS.map((item) => {
        const d = checkDetails[item.key] || { comment: "", photos: [] };
        const status = checklist[item.key];
        const comment = String(d.comment || "").trim() || "(no comment)";
        const photoCount = Array.isArray(d.photos) ? d.photos.length : 0;
        return `[${String(status).toUpperCase()}] ${item.label}: ${comment}${photoCount ? ` (photos: ${photoCount})` : ""}`;
      });
      const allPhotoRefs = CHECKLIST_ITEMS.flatMap((item) => checkDetails[item.key]?.photos || []);
      const enrichedNotes = [
        notes.trim(),
        checklistLines.length ? `\nChecklist:\n${checklistLines.join("\n")}` : ""
      ]
        .filter(Boolean)
        .join("\n");

      const payload = {
        asset_id: selectedAsset,
        manager_name: managerName.trim(),
        manager_signature: managerSignature.trim(),
        checklist,
        checklist_details,
        hour_meter_reading: hourMeter.trim(),
        notes: enrichedNotes,
        photos: allPhotoRefs
      };

      if (isOnline) {
        const response = await submitManagerInspection({
          ...payload,
          photos: await toUploadPhotos(payload.photos)
        });
        const parts = ["Inspection uploaded."];
        if (response?.manager_inspection_id) parts.push(`Manager ID: ${response.manager_inspection_id}`);
        if (response?.created_work_order_id) parts.push(`WO #${response.created_work_order_id} created/linked`);
        if (response?.created_breakdown_id) parts.push(`Breakdown #${response.created_breakdown_id}`);
        Alert.alert("Saved + Synced", parts.join("\n"));
        loadAudit().catch(() => null);
      } else {
        await queueInspection(payload);
        await refreshQueueCount();
        Alert.alert(
          "Saved Offline",
          allPhotoRefs.length
            ? "Inspection queued with photos. It will upload when you are back online."
            : "Inspection queued. It will upload when you are back online."
        );
      }
      setNotes("");
      setChecklist({ ...DEFAULT_CHECKLIST });
      setCheckDetails(buildDefaultCheckDetails());
    } catch (err) {
      Alert.alert("Error", err.message || "Could not save inspection.");
    } finally {
      setIsBusy(false);
    }
  }

  async function onSaveDamageReport() {
    if (isBusy) return;
    if (!managerName.trim()) return Alert.alert("Validation", "Enter manager name.");
    if (!managerSignature.trim()) return Alert.alert("Validation", "Enter manager signature.");
    if (!selectedAsset) return Alert.alert("Validation", "Select an asset.");
    if (!damageDescription.trim()) return Alert.alert("Validation", "Enter damage description.");

    setIsBusy(true);
    try {
      const payload = {
        asset_id: selectedAsset,
        manager_name: managerName.trim(),
        manager_signature: managerSignature.trim(),
        location: damageLocation.trim(),
        severity: damageSeverity,
        description: damageDescription.trim(),
        immediate_action: damageImmediateAction.trim(),
        out_of_service: damageOutOfService,
        photos: damagePhotos
      };

      if (isOnline) {
        const response = await submitManagerDamageReport({
          ...payload,
          photos: await toUploadPhotos(payload.photos)
        });
        const printUrl = `${getApiBaseUrl()}/manager/damages/${response.damage_report_id}/print`;
        Alert.alert("Damage Saved", `Report #${response.damage_report_id} saved.`, [
          { text: "Later" },
          { text: "Print/PDF", onPress: () => Linking.openURL(printUrl).catch(() => null) }
        ]);
      } else {
        await queueDamageReport(payload);
        await refreshQueueCount();
        Alert.alert(
          "Saved Offline",
          damagePhotos.length
            ? "Damage report queued with photos. It will upload when you are back online."
            : "Damage report queued. It will upload when you are back online."
        );
      }

      setDamageLocation("");
      setDamageSeverity("medium");
      setDamageDescription("");
      setDamageImmediateAction("");
      setDamageOutOfService(false);
      setDamagePhotos([]);
      loadAudit().catch(() => null);
    } catch (err) {
      Alert.alert("Error", err.message || "Could not save damage report.");
    } finally {
      setIsBusy(false);
    }
  }

  async function loadAudit() {
    setAuditLoading(true);
    try {
      const data = await fetchManagerAudit(20);
      setAuditEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (err) {
      setAuditEvents([]);
      Alert.alert("Audit", err.message || "Failed to load sync audit.");
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <ImageBackground source={require("./assets/company-logo.jpg")} style={styles.bgImage} imageStyle={styles.bgImageStyle}>
      <View style={styles.bgOverlay}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.mobileHeaderBrand}>
            <Image source={require("./assets/company-logo.jpg")} style={styles.mobileHeaderLogo} />
            <View>
              <Text style={styles.title}>InspectPro Manager</Text>
              <Text style={styles.subtitle}>Manager Field App</Text>
              <Text style={styles.versionBadge}>v1.0.0</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>{isOnline ? "Online" : "Offline"} | Queue: {syncState.remaining}</Text>
          <Text style={styles.apiMeta}>Server: {getApiBaseUrl()}</Text>
          <TextInput
            style={styles.input}
            placeholder="Default: ironlog.ironlogafrica.com/api — override if needed"
            value={apiBaseInput}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setApiBaseInput}
          />
          <Button title="Save Server URL" onPress={onSaveApiBase} />
          <Button title="Test Server Health" onPress={onTestServerHealth} />
          <Button
            title="Reset Server URL"
            onPress={async () => {
              await saveApiBase("");
              const next = API_BASE_URL;
              setApiBaseUrl(next);
              setApiBaseInput(next);
              setSelectedAsset(null);
              setAssetQuery("");
              setAssets([]);
              await refreshQueueCount();
              try {
                await fetchAssets().then((rows) => setAssets(Array.isArray(rows) ? rows : []));
                await loadAudit();
              } catch {
                // ignore; server URL shown in header will help user diagnose
              }
            }}
          />
          <Text style={styles.syncMeta}>
            {lastSyncAt
              ? `Last sync: ${new Date(lastSyncAt).toLocaleTimeString()}`
              : "Last sync: --"}
          </Text>
          {syncProgress.total > 0 && (
            <Text style={styles.syncProgress}>
              {syncProgress.stage === "done"
                ? `Sync complete (${syncProgress.total}/${syncProgress.total})`
                : `Syncing photos/records ${syncProgress.current}/${syncProgress.total}...`}
            </Text>
          )}

      <TextInput
        style={styles.input}
        placeholder="Manager Name"
        value={managerName}
        onChangeText={(v) => {
          setManagerName(v);
          if (!managerSignature.trim()) setManagerSignature(v);
        }}
      />
      <TextInput
        style={styles.input}
        placeholder="Manager Signature"
        value={managerSignature}
        onChangeText={setManagerSignature}
      />

      <Text style={styles.section}>Select Asset ({selectedAssetName})</Text>
      <TextInput
        style={styles.input}
        placeholder="Type equipment code or name..."
        value={assetQuery}
        onFocus={() => setShowAssetResults(true)}
        onBlur={() => setTimeout(() => setShowAssetResults(false), 150)}
        onChangeText={(text) => {
          setAssetQuery(text);
          setShowAssetResults(true);
        }}
      />
      {showAssetResults && assetQuery.trim() ? (
        <View style={styles.assetDropdown}>
          {filteredAssets.length ? (
            filteredAssets.map((item) => (
              <TouchableOpacity
                key={String(item.id)}
                onPressIn={() => onSelectAsset(item.id)}
                style={[styles.assetBtn, selectedAsset === item.id && styles.assetBtnSelected]}
              >
                <Text style={styles.assetCode}>{item.asset_code}</Text>
                <Text style={styles.assetName}>{item.asset_name}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noAssetText}>No equipment matches your search.</Text>
          )}
        </View>
      ) : null}

      <Text style={styles.section}>Current Hours: {currentHours}</Text>
      <TextInput
        style={styles.input}
        placeholder="Hour Meter"
        keyboardType="numeric"
        value={hourMeter}
        onChangeText={setHourMeter}
      />

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "inspection" && styles.tabBtnActive]}
          onPress={() => setActiveTab("inspection")}
        >
          <Text style={[styles.tabBtnText, activeTab === "inspection" && styles.tabBtnTextActive]}>Inspection</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "damage" && styles.tabBtnActive]}
          onPress={() => setActiveTab("damage")}
        >
          <Text style={[styles.tabBtnText, activeTab === "damage" && styles.tabBtnTextActive]}>Damage Report</Text>
        </TouchableOpacity>
      </View>

      {activeTab === "inspection" ? (
        <View>
          <Text style={styles.section}>Checklist</Text>
          {CHECKLIST_ITEMS.map((item) => (
            <View key={item.key}>
              <ChecklistToggle
                label={item.label}
                value={checklist[item.key]}
                onChange={(value) => setChecklist((prev) => ({ ...prev, [item.key]: value }))}
              />
              <TextInput
                style={[styles.input, styles.checkCommentInput]}
                placeholder={`${item.label} comment...`}
                multiline
                value={checkDetails[item.key]?.comment || ""}
                onChangeText={(text) =>
                  setCheckDetails((prev) => ({
                    ...prev,
                    [item.key]: {
                      ...(prev[item.key] || { comment: "", photos: [] }),
                      comment: text
                    }
                  }))
                }
              />
              <View style={styles.row}>
                <Button title="Add Photo (Cam)" onPress={() => addPhotoToCheck(item.key, "camera")} />
                <Button title="Add Photo (Gal)" onPress={() => addPhotoToCheck(item.key, "gallery")} />
              </View>
              <Text style={styles.photoCount}>
                {item.label} photos: {(checkDetails[item.key]?.photos || []).length}/3
              </Text>
            </View>
          ))}

          <TextInput
            style={[styles.input, styles.notes]}
            placeholder="Inspection notes"
            multiline
            value={notes}
            onChangeText={setNotes}
          />

          <Text style={styles.photoCount}>
            Total photos attached: {CHECKLIST_ITEMS.reduce((sum, item) => sum + ((checkDetails[item.key]?.photos || []).length), 0)}
          </Text>

          <Button title={isBusy ? "Saving..." : "Save Inspection"} onPress={onSaveInspection} disabled={isBusy} />
        </View>
      ) : (
        <View>
          <Text style={styles.section}>Damage Location</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Boom cylinder, left track, cab guard"
            value={damageLocation}
            onChangeText={setDamageLocation}
          />

          <Text style={styles.section}>Severity</Text>
          <View style={styles.statusButtons}>
            {["low", "medium", "high", "critical"].map((sev) => (
              <TouchableOpacity
                key={sev}
                onPress={() => setDamageSeverity(sev)}
                style={[styles.statusBtn, damageSeverity === sev && styles.tabBtnActive]}
              >
                <Text style={[styles.statusBtnText, damageSeverity === sev && styles.tabBtnTextActive]}>
                  {sev.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>Damage Description</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            placeholder="Describe observed damage and impact"
            multiline
            value={damageDescription}
            onChangeText={setDamageDescription}
          />

          <Text style={styles.section}>Immediate Action</Text>
          <TextInput
            style={[styles.input, styles.checkCommentInput]}
            placeholder="Temporary controls / action taken"
            multiline
            value={damageImmediateAction}
            onChangeText={setDamageImmediateAction}
          />

          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.tabBtn, damageOutOfService && styles.tabBtnActive]}
              onPress={() => setDamageOutOfService((v) => !v)}
            >
              <Text style={[styles.tabBtnText, damageOutOfService && styles.tabBtnTextActive]}>
                {damageOutOfService ? "Out Of Service: YES" : "Out Of Service: NO"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <Button title="Damage Photo (Cam)" onPress={() => addPhotoToDamage("camera")} />
            <Button title="Damage Photo (Gal)" onPress={() => addPhotoToDamage("gallery")} />
          </View>
          <Text style={styles.photoCount}>Damage photos: {damagePhotos.length}/8</Text>

          <Button title={isBusy ? "Saving..." : "Save Damage Report"} onPress={onSaveDamageReport} disabled={isBusy} />
        </View>
      )}

      <View style={{ height: 8 }} />
      <Button title="Sync Now" onPress={() => runSync()} />

      <Text style={styles.section}>Sync Audit (Last 20)</Text>
      <Button title="Refresh Audit" onPress={() => loadAudit()} />
      {auditLoading ? (
        <View style={styles.auditLoading}>
          <ActivityIndicator size="small" />
          <Text style={styles.auditLoadingText}>Loading audit...</Text>
        </View>
      ) : auditEvents.length ? (
        <View style={styles.auditList}>
          {auditEvents.map((e) => (
            <View key={String(e.id)} style={styles.auditCard}>
              <Text style={styles.auditTop}>
                {String(e.status || "ok").toUpperCase()} | {e.event_time || "-"}
              </Text>
              <Text style={styles.auditLine}>Mgr: {e.manager_name || "-"}</Text>
              <Text style={styles.auditLine}>Asset: {e.asset_id ?? "-"}</Text>
              <Text style={styles.auditLine}>Core Insp: {e.mirrored_inspection_id ?? "-"}</Text>
              <Text style={styles.auditLine}>WO: {e.created_work_order_id ?? "-"}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.auditEmpty}>No audit events yet.</Text>
      )}

          <StatusBar style="auto" />
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10
  },
  bgImage: {
    flex: 1
  },
  bgImageStyle: {
    opacity: 0.28
  },
  bgOverlay: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.84)"
  },
  title: {
    fontSize: 24,
    fontWeight: "700"
  },
  mobileHeaderBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  mobileHeaderLogo: {
    width: 54,
    height: 54,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff"
  },
  subtitle: {
    color: "#555",
    marginBottom: 2
  },
  versionBadge: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#334155",
    fontSize: 11,
    fontWeight: "700"
  },
  syncMeta: {
    color: "#555",
    marginBottom: 8,
    fontSize: 12
  },
  apiMeta: {
    color: "#334155",
    fontSize: 12,
    marginBottom: 6
  },
  syncProgress: {
    color: "#1f6feb",
    fontWeight: "600",
    marginBottom: 6
  },
  section: {
    marginTop: 10,
    fontWeight: "700"
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  tabBtn: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff"
  },
  tabBtnActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#e8f0ff"
  },
  tabBtnText: {
    color: "#333",
    fontWeight: "600"
  },
  tabBtnTextActive: {
    color: "#1f6feb",
    fontWeight: "700"
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fff"
  },
  notes: {
    minHeight: 90,
    textAlignVertical: "top"
  },
  checkCommentInput: {
    minHeight: 62,
    marginTop: 6
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  assetBtn: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 8,
    padding: 10,
    marginRight: 8,
    minWidth: 150,
    backgroundColor: "#fff"
  },
  assetDropdown: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    maxHeight: 220,
    padding: 6,
    backgroundColor: "#fff"
  },
  assetBtnSelected: {
    borderColor: "#1f6feb",
    backgroundColor: "#e8f0ff"
  },
  assetCode: {
    fontWeight: "700"
  },
  assetName: {
    color: "#444"
  },
  noAssetText: {
    color: "#666",
    padding: 8
  },
  checkRow: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 8,
    marginTop: 8
  },
  checkRowOk: {
    backgroundColor: "#f8fffb",
    borderColor: "#b7e4c7"
  },
  checkRowAttention: {
    backgroundColor: "#fff9e6",
    borderColor: "#f59e0b"
  },
  checkRowUnsafe: {
    backgroundColor: "#fff0f0",
    borderColor: "#ef4444"
  },
  checkLabel: {
    fontWeight: "600",
    marginBottom: 6
  },
  statusButtons: {
    flexDirection: "row",
    gap: 8
  },
  statusBtn: {
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  statusBtn_ok: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981"
  },
  statusBtn_attention: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b"
  },
  statusBtn_unsafe: {
    backgroundColor: "#fee2e2",
    borderColor: "#ef4444"
  },
  statusBtnText: {
    fontSize: 12,
    fontWeight: "700"
  },
  photoCount: {
    color: "#555"
  },
  auditLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8
  },
  auditLoadingText: {
    color: "#555"
  },
  auditList: {
    gap: 8,
    marginTop: 8
  },
  auditCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#fff"
  },
  auditTop: {
    fontWeight: "700",
    marginBottom: 4
  },
  auditLine: {
    color: "#444",
    fontSize: 12
  },
  auditEmpty: {
    color: "#666",
    marginTop: 8
  }
});

