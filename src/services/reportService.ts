import { db } from "../services/firebase";
import { getDeviceId } from "../utils/device";
import { ref, get, set, push } from "firebase/database";

const COOLDOWN_DURATION = 5 * 1000; // 5 seconds (for testing)

export const checkCooldown = async (): Promise<{ onCooldown: boolean; remainingSeconds: number }> => {
  const deviceId = getDeviceId();
  const deviceRef = ref(db, `devices/${deviceId}`);
  const now = Date.now();

  const deviceSnap = await get(deviceRef);
  if (deviceSnap.exists()) {
    const cooldownUntil = deviceSnap.val().cooldownUntil;
    if (now < cooldownUntil) {
      const remainingSeconds = Math.ceil((cooldownUntil - now) / 1000);
      return { onCooldown: true, remainingSeconds };
    }
  }
  return { onCooldown: false, remainingSeconds: 0 };
};

export const submitEmergencyReport = async (reportData: {
  type: string;
  description: string;
  location: { lat: number; lng: number };
}) => {
  const deviceId = getDeviceId();
  const deviceRef = ref(db, `devices/${deviceId}`);
  const now = Date.now();

  // Get device info
  const deviceSnap = await get(deviceRef);
  if (deviceSnap.exists()) {
    // Check if device is blocked
    if (deviceSnap.val().isBlocked) {
      throw new Error("This device has been blocked from submitting reports.");
    }
    
    const cooldownUntil = deviceSnap.val().cooldownUntil;
    if (now < cooldownUntil) {
      const waitMin = Math.ceil((cooldownUntil - now) / 60000);
      throw new Error(`Please wait ${waitMin} minutes before submitting another report.`);
    }
  }

  // Submit report
  const reportsRef = ref(db, "reports");
  await push(reportsRef, {
    ...reportData,
    timestamp: now,
    deviceId,
    status: 'active'
  });

  // Update device metadata
  await set(deviceRef, {
    lastReportTime: now,
    totalReports: (deviceSnap.exists() ? deviceSnap.val().totalReports || 0 : 0) + 1,
    cooldownUntil: now + COOLDOWN_DURATION,
    isBlocked: deviceSnap.exists() ? deviceSnap.val().isBlocked : false
  });
}; 