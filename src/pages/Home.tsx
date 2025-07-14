import { useState, useEffect } from "react";
import { submitEmergencyReport, checkCooldown } from "../services/reportService";

export default function Home() {
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onCooldown, setOnCooldown] = useState(false);
  const [cooldownTime, setCooldownTime] = useState<number>(0);

  // Check cooldown status
  const checkCooldownStatus = async () => {
    const { onCooldown: isOnCooldown, remainingSeconds } = await checkCooldown();
    setOnCooldown(isOnCooldown);
    setCooldownTime(remainingSeconds);
  };

  useEffect(() => {
    checkCooldownStatus();
    const interval = setInterval(checkCooldownStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch geolocation on page load with high accuracy
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.error("Geolocation error:", err);
        setError("Unable to get your location. Please enable location services.");
      },
      { enableHighAccuracy: true }
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      setError("Location not available.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await submitEmergencyReport({
        type,
        description,
        location,
      });
      setSuccess(true);
      setDescription("");
      setType("");
      checkCooldownStatus(); // Update cooldown status after submission
    } catch (err: any) {
      console.error("Failed to submit:", err);
      setError(err.message || "Failed to submit report. Please try again.");
    }
    setLoading(false);
  };

  const formatCooldownTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-6 text-red-600">
        Report Emergency
      </h1>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800">Type of Emergency (Optional)</label>
            <select
              className="w-full border border-gray-100 rounded-md p-2 text-gray-800"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Select type...</option>
              <option value="Fire">Fire</option>
              <option value="Crime">Crime</option>
              <option value="Medical">Medical</option>
              <option value="Accident">Accident</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-800">Description (Optional)</label>
            <textarea
              className="w-full border border-gray-300 rounded-md p-2 h-24 text-gray-800"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe the situation..."
            />
          </div>

          <button
            type="submit"
            disabled={loading || !location || onCooldown}
            className={`w-full py-3 rounded-md shadow-md transition-colors flex flex-col items-center justify-center ${
              onCooldown
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-red-700 hover:bg-red-800 text-white disabled:bg-gray-400"
            }`}
          >
            <span className="text-lg font-semibold">
              {loading ? "Submitting..." : "Send Emergency Report"}
            </span>
            <span className="text-xs opacity-80">
              Can be use as panic button forb immediate assistance
            </span>
            {onCooldown && (
              <span className="text-[10px] opacity-70">
                Available in {formatCooldownTime(cooldownTime)}
              </span>
            )}
          </button>

          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          <div className="my-6 border-t border-gray-200" />

          <div className="space-y-2">
            <a
              href="tel:911"
              className="w-full bg-red-100 text-red-700 py-3 rounded-md hover:bg-red-200 text-base font-medium shadow-sm transition-colors flex items-center justify-center"
            >
             Call National Emergency: 911
            </a>
            <a
              href="tel:117"
              className="w-full bg-blue-100 text-blue-700 py-3 rounded-md hover:bg-blue-200 text-base font-medium shadow-sm transition-colors flex items-center justify-center"
            >
              Call PNP Hotline: 117
            </a>
          </div>

          {success && (
            <p className="text-green-600 text-center mt-2">✅ Report submitted successfully!</p>
          )}
        </form>

        <div className="text-sm text-gray-500 text-center mt-6">
          {location
            ? `📍 Your Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
            : "🔄 Getting your location..."}
        </div>
      </div>
    </div>
  );
}
