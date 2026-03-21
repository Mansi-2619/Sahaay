import { useCallback, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

const BASE = "http://localhost:8000";

export function logPrediction(predictions, overall) {
  try {
    const history = JSON.parse(localStorage.getItem("prediction_history") || "[]");
    history.push({
      time: new Date().toLocaleString(),
      overall,
      predictions,
    });
    // Keep last 100 entries
    if (history.length > 100) history.shift();
    localStorage.setItem("prediction_history", JSON.stringify(history));
    window.dispatchEvent(new Event("prediction_logged"));
  } catch {}
}

export function usePrediction() {
  const [predictions, setPredictions] = useState(null);
  const [overallRisk, setOverallRisk] = useState(null);
  const [loading, setLoading]         = useState(false);

  const runPrediction = useCallback(async (inputData = {}) => {
    setLoading(true);
    try {
      const res = await axios.post(`${BASE}/predict/all`, inputData);
      const preds   = res.data.predictions;
      const overall = res.data.overall_highest_risk;

      setPredictions(preds);
      setOverallRisk(overall);

      // 🔔 Toast on HIGH risk
      if (overall === "HIGH") {
        const highTypes = Object.entries(preds)
          .filter(([, d]) => d?.risk_level === "HIGH")
          .map(([t]) => t.replace("_", " "))
          .join(", ");
        toast.error(`🚨 HIGH risk detected: ${highTypes}`, {
          duration: 6000,
          style: { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5" },
        });
      } else if (overall === "MEDIUM") {
        toast(`⚠️ Medium risk detected — stay alert`, {
          duration: 4000,
          style: { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" },
        });
      }

      // 📋 Log to history
      logPrediction(preds, overall);

      return { predictions: preds, overall };
    } catch (err) {
      toast.error("Prediction failed — check backend");
    } finally {
      setLoading(false);
    }
  }, []);

  return { predictions, overallRisk, loading, runPrediction };
}