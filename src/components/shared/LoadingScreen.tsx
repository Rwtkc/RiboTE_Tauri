import { Activity } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-screen__center">
        <div className="loading-screen__mark">
          <Activity size={42} />
        </div>
        <div className="loading-screen__copy">
          <h2>RiboTE</h2>
          <div className="loading-screen__status">
            <span className="loading-screen__dot" />
            <p>Preparing Analysis...</p>
          </div>
        </div>
        <div className="loading-screen__bar">
          <span className="loading-screen__bar-fill" />
        </div>
      </div>
    </div>
  );
}
