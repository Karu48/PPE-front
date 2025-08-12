import React, { useEffect, useRef, useState } from "react";
import { findDOMNode } from "react-dom";
import { AmplifyAuthenticator, AmplifySignIn } from "@aws-amplify/ui-react/legacy";
import { onAuthUIStateChange } from "@aws-amplify/ui-components";
import Webcam from "react-webcam";
import { Alert, Col, Row, Nav, Navbar, Card } from "react-bootstrap";

import gateway from "./utils/gateway";
import { ppeMapper } from "./utils/ppe";
import { isUndefined, formatErrorMessage } from "./utils";

import CameraHelp from "./components/CameraHelp";
import ProtectionSummary from "./components/ProtectionSummary";
import Header from "./components/Header";
import SettingsHelp from "./components/SettingsHelp";
import Navigation from "./components/Navigation";
import VideoUpload from "./components/VideoUpload";

const App = () => {
  const [authState, setAuthState] = useState("signin");
  const [testResults, setTestResults] = useState([]);
  const [errorDetails, setErrorDetails] = useState(undefined);
  const [readyToStream, setReadyToStream] = useState(false);
  const [webcamCoordinates, setWebcamCoordinates] = useState({});
  const [activeMode, setActiveMode] = useState("live");
  const iterating = useRef(false);
  const webcam = useRef(undefined);
  const resultsBufferRef = useRef([]);
  const perPersonBufferRef = useRef(new Map()); // personId -> Array<{t:number, compliant:boolean}>
  const perPersonPpeBufferRef = useRef(new Map()); // personId -> bodyPartKey -> Array<{t:number, present:boolean}>

  // Live detection parameters
  const [liveDetectionMethod, setLiveDetectionMethod] = useState("any"); // 'any' | 'percentage' (compliance-based)
  const [liveWindowSizeSeconds, setLiveWindowSizeSeconds] = useState(3);
  const [livePercentageThreshold, setLivePercentageThreshold] = useState(50);

  const getSnapshot = async () => {
    setWebcamCoordinates(findDOMNode(webcam.current).getBoundingClientRect());
    const image = webcam.current.getScreenshot();
    const b64Encoded = image.split(",")[1];

    try {
      const result = await gateway.processImage(b64Encoded);
      const people = result.Persons.map(ppeMapper);

      // Buffer recent frame outcomes
      const now = Date.now() / 1000;
      const hasPeople = people && people.length > 0;
      const isCompliantFrame = hasPeople && people.every((p) => !p.hasAlarm);
      const buffer = resultsBufferRef.current;
      buffer.push({ t: now, compliant: isCompliantFrame });

      // Update per-person compliance buffer
      const personBuffer = perPersonBufferRef.current;
      people.forEach((person) => {
        const pid = person.id;
        const arr = personBuffer.get(pid) || [];
        arr.push({ t: now, compliant: !person.hasAlarm });
        personBuffer.set(pid, arr);
      });

      // Update per-person per-PPE presence buffer (by body part)
      const ppeBuffer = perPersonPpeBufferRef.current;
      const BODY_PART_KEYS = [
        { key: "FACE", label: "cara" },
        { key: "HEAD", label: "cabeza" },
        { key: "LEFT_HAND", label: "mano izquierda" },
        { key: "RIGHT_HAND", label: "mano derecha" },
      ];
      people.forEach((person) => {
        const pid = person.id;
        const missing = (person.missingPPE || []).map((m) => (m.bodyPart || "").toLowerCase());
        const perPersonMap = ppeBuffer.get(pid) || new Map();
        BODY_PART_KEYS.forEach(({ key, label }) => {
          const present = !missing.includes(label);
          const arr = perPersonMap.get(key) || [];
          arr.push({ t: now, present });
          perPersonMap.set(key, arr);
        });
        ppeBuffer.set(pid, perPersonMap);
      });
      // Keep a reasonable history (at least up to 2x current window, min 30s)
      const maxKeep = Math.max(30, (Number(liveWindowSizeSeconds) || 3) * 2);
      while (buffer.length && buffer[0].t < now - maxKeep) buffer.shift();

      // Compute decision over the last N seconds (frame-level compliance)
      const windowSize = Math.max(0.5, Number(liveWindowSizeSeconds) || 3);
      const windowFrames = buffer.filter((x) => x.t >= now - windowSize);
      let shouldShow = false;
      if (windowFrames.length > 0) {
        if (liveDetectionMethod === "any") {
          shouldShow = windowFrames.some((x) => x.compliant);
        } else {
          const compliantCount = windowFrames.filter((x) => x.compliant).length;
          const percent = (compliantCount / windowFrames.length) * 100;
          shouldShow = percent >= (Number(livePercentageThreshold) || 0);
        }
      }

      // Compute per-person compliance over the last N seconds
      const peopleWithCompliance = people.map((person) => {
        const pid = person.id;
        const entries = (perPersonBufferRef.current.get(pid) || []).filter(
          (x) => x.t >= now - windowSize
        );
        let isCompliant = false;
        let percent = 0;
        if (entries.length > 0) {
          const compliantCount = entries.filter((x) => x.compliant).length;
          percent = (compliantCount / entries.length) * 100;
          if (liveDetectionMethod === "any") {
            isCompliant = compliantCount > 0;
          } else {
            isCompliant = percent >= (Number(livePercentageThreshold) || 0);
          }
        } else {
          // Fallback to current frame if no history for this person
          isCompliant = !person.hasAlarm;
          percent = isCompliant ? 100 : 0;
        }

        // Compute per-PPE compliance over the window
        const ppeMap = perPersonPpeBufferRef.current.get(pid) || new Map();
        const ppeCompliance = {};
        ["FACE", "HEAD", "LEFT_HAND", "RIGHT_HAND"].forEach((bpKey) => {
          const ppeEntries = (ppeMap.get(bpKey) || []).filter((x) => x.t >= now - windowSize);
          let present = false;
          let pPercent = 0;
          if (ppeEntries.length > 0) {
            const presentCount = ppeEntries.filter((x) => x.present).length;
            pPercent = (presentCount / ppeEntries.length) * 100;
            present = liveDetectionMethod === "any" ? presentCount > 0 : pPercent >= (Number(livePercentageThreshold) || 0);
          } else {
            // Fallback to current frame using missingPPE
            const currentMissing = (person.missingPPE || []).map((m) => (m.bodyPart || "").toLowerCase());
            const label = bpKey === "FACE" ? "cara" : bpKey === "HEAD" ? "cabeza" : bpKey === "LEFT_HAND" ? "mano izquierda" : "mano derecha";
            present = !currentMissing.includes(label);
            pPercent = present ? 100 : 0;
          }
          ppeCompliance[bpKey] = { present, percent: pPercent };
        });

        return {
          ...person,
          complianceStatus: {
            isCompliant,
            percent,
            method: liveDetectionMethod,
            windowSizeSeconds: windowSize,
            threshold: livePercentageThreshold,
          },
          ppeCompliance,
        };
      });

      // Always show detected persons; include compliance fields for UI
      setTestResults(peopleWithCompliance);

      if (iterating.current) setTimeout(getSnapshot, 300);
      else setTestResults([]);
    } catch (e) {
      setErrorDetails(formatErrorMessage(e));
      console.log(e);
    }
  };

  const setupWebcam = (instance) => {
    webcam.current = instance;

    const checkIfReady = () => {
      if (
        webcam.current &&
        webcam.current.state &&
        webcam.current.state.hasUserMedia
      ) {
        setReadyToStream(true);
      } else setTimeout(checkIfReady, 250);
    };

    checkIfReady();
  };

  const toggleRekognition = () => {
    iterating.current = !iterating.current;

    if (iterating.current) {
      getSnapshot();
    } else setTestResults([]);
  };

  useEffect(() => {
    return onAuthUIStateChange((s) => setAuthState(s));
  }, []);

  const signedIn = authState === "signedin";

  const renderLiveCamera = () => (
    <>
      {/* Live detection parameters (placed above camera and summary) */}
      <Card style={{ marginBottom: "10px" }}>
        <Card.Header>
          <strong>Parámetros (Cámara en Vivo)</strong>
        </Card.Header>
        <Card.Body>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <div style={{ minWidth: 220 }}>
              <label style={{ display: "block", fontWeight: 600 }}>Método</label>
              <select
                className="form-control"
                value={liveDetectionMethod}
                onChange={(e) => setLiveDetectionMethod(e.target.value)}
              >
                <option value="any">Cualquier frame con EPP</option>
                <option value="percentage">% de frames con EPP</option>
              </select>
            </div>
            <div style={{ minWidth: 220 }}>
              <label style={{ display: "block", fontWeight: 600 }}>Tamaño de ventana (seg)</label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                className="form-control"
                value={liveWindowSizeSeconds}
                onChange={(e) => setLiveWindowSizeSeconds(Number(e.target.value))}
              />
            </div>
            {liveDetectionMethod === "percentage" && (
              <div style={{ minWidth: 220 }}>
                <label style={{ display: "block", fontWeight: 600 }}>Umbral (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  className="form-control"
                  value={livePercentageThreshold}
                  onChange={(e) => setLivePercentageThreshold(Number(e.target.value))}
                />
              </div>
            )}
          </div>
          <Alert variant="warning" style={{ marginTop: 12, marginBottom: 0, padding: "6px 10px" }}>
            Los cambios en estos parámetros requieren reiniciar la detección para surtir efecto.
          </Alert>
        </Card.Body>
      </Card>

      <CameraHelp show={!readyToStream} />
      <Row>
        <Col md={8} sm={6}>
          <Webcam
            audio={false}
            ref={setupWebcam}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              width: 1280,
              height: 640,
              facingMode: "user",
            }}
            style={{ width: "100%", marginTop: "10px" }}
          />
        </Col>
        <Col md={4} sm={6}>
          <Alert
            variant="danger"
            style={{
              display: isUndefined(errorDetails) ? "none" : "block",
            }}
          >
            Ocurrió un error{errorDetails && `: ${errorDetails}`}.{" "}
            <a href={window.location.href}>Reintentar</a>.
          </Alert>
          <ProtectionSummary
            testResults={testResults}
            webcamCoordinates={webcamCoordinates}
          />
        </Col>
      </Row>
    </>
  );

  const renderVideoUpload = () => (
    <VideoUpload />
  );

  return (
    <div className="App">
      <Header
        readyToStream={readyToStream}
        signedIn={signedIn}
        toggleRekognition={toggleRekognition}
        activeMode={activeMode}
      />
      {!window.rekognitionSettings ? (
        <SettingsHelp />
      ) : signedIn ? (
        <>
          <Navigation 
            activeMode={activeMode} 
            onModeChange={setActiveMode} 
          />
          {activeMode === "live" ? renderLiveCamera() : renderVideoUpload()}
        </>
      ) : (
        <div className="amplify-auth-container">
          <AmplifyAuthenticator usernameAlias="email">
            <AmplifySignIn
              slot="sign-in"
              usernameAlias="email"
              formFields={[
                {
                  type: "email",
                  label: "Correo electrónico *",
                  placeholder: "Correo electrónico",
                  required: true,
                  inputProps: { autoComplete: "off" },
                },
                {
                  type: "password",
                  label: "Contraseña *",
                  placeholder: "Contraseña",
                  required: true,
                  inputProps: { autoComplete: "off" },
                },
              ]}
            >
              <div slot="secondary-footer-content"></div>
            </AmplifySignIn>
          </AmplifyAuthenticator>
        </div>
      )}
    </div>
  );
};

export default App;
