(function () {
  const POSITION_PANEL_ID = "auto-lwh-position-panel";
  const DEFAULT_SIZE = { x: 2.5, y: 1.8, z: 1.2 };
  const ALLOWED_ORIGINS = ["http://localhost:8190"];

  if (!ALLOWED_ORIGINS.includes(location.origin)) return;

  function getPagePc() {
    return (
      window.editor?.pc || window.__APP__?.editor?.pc || window.app?.pc || null
    );
  }

  function getCurrentFrameNumber() {
    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;
    const fIdx = editor?.state?.frameIndex;
    if (typeof fIdx === "number" && Number.isFinite(fIdx) && fIdx >= 0) {
      return fIdx + 1;
    }
    return null;
  }

  function getSelectedObject() {
    const candidates = [
      window.editor?.pc?.selection?.[0],
      window.editor?.selection?.[0],
      window.__APP__?.editor?.pc?.selection?.[0],
      window.__APP__?.editor?.selection?.[0],
      window.app?.editor?.pc?.selection?.[0],
      window.app?.editor?.selection?.[0],
      window.app?.pc?.selection?.[0],
      window.editor?.pc?.selectionMap &&
        Object.values(window.editor.pc.selectionMap)[0],
      window.editor?.selectionMap &&
        Object.values(window.editor.selectionMap)[0],
      window.selectedObject,
      window.activeObject,
    ];

    return candidates.find((obj) => obj && obj.position) || null;
  }

  // Đã xóa chức năng tự động lưu theo yêu cầu người dùng.
  // Tool chỉ đánh dấu needSave = true trên frame để người dùng bấm nút Save thủ công trên Xtreme1.
  function persistEditorState() {
    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;
    if (!editor) return;
    const curFrame = editor.getCurrentFrame?.();
    if (curFrame) {
      curFrame.needSave = true;
    }
  }

  function applyObjectTransform(obj, payload) {
    if (!obj || !payload) return false;

    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;
    const pc = getPagePc();

    // Chuẩn hóa payload.rotation: Trong Three.js, Euler.copy() bắt buộc đọc _x, _y, _z, _order.
    // Nếu truyền object thuần { x, y, z } vào copy() thì Three.js gán _x=undefined -> NaN -> box bị ẩn biến mất hoàn toàn!
    if (payload.rotation) {
      if (payload.rotation._x === undefined || typeof payload.rotation.set !== "function") {
        if (obj.rotation && typeof obj.rotation.clone === "function") {
          const euler = obj.rotation.clone();
          euler.set(
            Number(payload.rotation.x) || 0,
            Number(payload.rotation.y) || 0,
            Number(payload.rotation.z) || 0,
            payload.rotation.order || obj.rotation.order || "XYZ"
          );
          payload.rotation = euler;
        }
      }
    }

    if (payload.position) {
      payload.position.x = Number(payload.position.x) || 0;
      payload.position.y = Number(payload.position.y) || 0;
      payload.position.z = Number(payload.position.z) || 0;
    }

    if (payload.scale) {
      payload.scale.x = Number(payload.scale.x) || 1;
      payload.scale.y = Number(payload.scale.y) || 1;
      payload.scale.z = Number(payload.scale.z) || 1;
    }

    if (
      editor &&
      editor.cmdManager &&
      typeof editor.cmdManager.execute === "function" &&
      payload &&
      (payload.position || payload.scale || payload.rotation)
    ) {
      try {
        editor.cmdManager.execute("update-transform", {
          object: obj,
          transform: payload,
        });
        if (typeof obj.updateMatrixWorld === "function") {
          obj.updateMatrixWorld(true);
        }
        pc?.render?.();
        persistEditorState();
        return true;
      } catch (error) {
        console.warn("cmdManager.execute(update-transform) failed:", error);
      }
    }

    if (pc && typeof pc.updateObjectTransform === "function") {
      pc.updateObjectTransform(obj, payload);
    } else {
      if (obj.position && payload && payload.position) {
        if (typeof obj.position.set === "function") {
          obj.position.set(payload.position.x, payload.position.y, payload.position.z);
        } else if (typeof obj.position.copy === "function") {
          obj.position.copy(payload.position);
        }
      }
      if (obj.scale && payload && payload.scale) {
        if (typeof obj.scale.set === "function") {
          obj.scale.set(payload.scale.x, payload.scale.y, payload.scale.z);
        } else if (typeof obj.scale.copy === "function") {
          obj.scale.copy(payload.scale);
        }
      }
      if (obj.rotation && payload && payload.rotation) {
        if (typeof obj.rotation.set === "function") {
          obj.rotation.set(
            Number(payload.rotation.x) || 0,
            Number(payload.rotation.y) || 0,
            Number(payload.rotation.z) || 0,
            payload.rotation.order || "XYZ"
          );
        } else if (typeof obj.rotation.copy === "function") {
          obj.rotation.copy(payload.rotation);
        }
      }
    }

    if (typeof obj.updateMatrixWorld === "function") {
      obj.updateMatrixWorld(true);
    }
    pc?.render?.();
    persistEditorState();
    return true;
  }

  function setLwh() {
    const obj = getSelectedObject();
    if (!obj) return false;

    const needSet =
      Math.abs(obj.scale.x - DEFAULT_SIZE.x) > 1e-6 ||
      Math.abs(obj.scale.y - DEFAULT_SIZE.y) > 1e-6 ||
      Math.abs(obj.scale.z - DEFAULT_SIZE.z) > 1e-6;

    if (needSet) {
      applyObjectTransform(obj, {
        scale: { x: DEFAULT_SIZE.x, y: DEFAULT_SIZE.y, z: DEFAULT_SIZE.z },
      });
      console.log("Auto set LWH:", obj.scale.toArray());
    }

    return true;
  }

  function getSelectedClassName() {
    const obj = getSelectedObject();
    if (!obj) return "No selection";

    const userData = obj.userData || {};
    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;

    if (typeof editor?.getClassType === "function") {
      const classConfig = editor.getClassType(userData);
      if (classConfig?.name) return String(classConfig.name);
    }

    const key = userData.classId || userData.classType;
    const classMap = editor?.classMap;
    if (key && classMap?.get) {
      const classConfig = classMap.get(String(key));
      if (classConfig?.name) return String(classConfig.name);
    }

    const dataCandidates = [
      userData.classType,
      userData.className,
      userData.type,
      userData.name,
      obj.className,
      obj.type,
      obj.name,
    ];

    const className = dataCandidates.find((value) => {
      if (typeof value !== "string") return false;
      const trimmed = value.trim();
      return trimmed && trimmed !== "Object";
    });

    return className ? className.trim() : "Unknown";
  }

  function applySelectedLwh(sourceRole = null) {
    const obj = getSelectedObject();
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!obj || !obj.scale || !panel) return false;

    const lInput = panel.querySelector('[data-role="l"]');
    const wInput = panel.querySelector('[data-role="w"]');
    const hInput = panel.querySelector('[data-role="h"]');
    const statusEl = panel.querySelector('[data-role="status"]');
    const syncWh =
      panel.querySelector('[data-role="sync-wh"]')?.checked ?? false;
    const syncLw =
      panel.querySelector('[data-role="sync-lw"]')?.checked ?? false;

    if (syncWh && sourceRole === "w" && hInput) hInput.value = wInput.value;
    if (syncWh && sourceRole === "h" && wInput) wInput.value = hInput.value;
    if (syncLw && sourceRole === "l" && wInput) wInput.value = lInput.value;
    if (syncLw && sourceRole === "w" && lInput) lInput.value = wInput.value;

    if (syncWh && syncLw) {
      if (sourceRole === "l") {
        if (wInput) wInput.value = lInput.value;
        if (hInput) hInput.value = lInput.value;
      } else if (sourceRole === "w") {
        if (lInput) lInput.value = wInput.value;
        if (hInput) hInput.value = wInput.value;
      } else if (sourceRole === "h") {
        if (lInput) lInput.value = hInput.value;
        if (wInput) wInput.value = hInput.value;
      }
    }

    const next = {
      x: Number(lInput?.value ?? obj.scale.x),
      y: Number(wInput?.value ?? obj.scale.y),
      z: Number(hInput?.value ?? obj.scale.z),
    };

    const same =
      Math.abs(obj.scale.x - next.x) < 1e-5 &&
      Math.abs(obj.scale.y - next.y) < 1e-5 &&
      Math.abs(obj.scale.z - next.z) < 1e-5;

    if (same) {
      if (statusEl)
        statusEl.textContent = `Size already at ${next.x.toFixed(2)}, ${next.y.toFixed(2)}, ${next.z.toFixed(2)}`;
      return true;
    }

    try {
      applyObjectTransform(obj, {
        scale: { x: next.x, y: next.y, z: next.z },
      });
      if (statusEl)
        statusEl.textContent = `Size updated: ${next.x.toFixed(2)}, ${next.y.toFixed(2)}, ${next.z.toFixed(2)}`;
      requestAnimationFrame(() => updatePositionPanel());
      return true;
    } catch (error) {
      console.error("applySelectedLwh failed:", error);
      if (statusEl) statusEl.textContent = "Size update failed.";
      return false;
    }
  }

  function applySignalSize() {
    const obj = getSelectedObject();
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!obj || !obj.scale || !panel) return false;

    const size = { x: 0.15, y: 0.5, z: 0.5 };
    const lInput = panel.querySelector('[data-role="l"]');
    const wInput = panel.querySelector('[data-role="w"]');
    const hInput = panel.querySelector('[data-role="h"]');

    if (lInput) lInput.value = size.x.toFixed(2);
    if (wInput) wInput.value = size.y.toFixed(2);
    if (hInput) hInput.value = size.z.toFixed(2);

    applyObjectTransform(obj, {
      scale: { x: size.x, y: size.y, z: size.z },
    });
    requestAnimationFrame(() => updatePositionPanel());
    return true;
  }

  function applyConeSize() {
    const obj = getSelectedObject();
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!obj || !obj.scale || !panel) return false;

    const size = { x: 0.41, y: 0.41, z: 0.41 };
    const lInput = panel.querySelector('[data-role="l"]');
    const wInput = panel.querySelector('[data-role="w"]');
    const hInput = panel.querySelector('[data-role="h"]');

    if (lInput) lInput.value = size.x.toFixed(2);
    if (wInput) wInput.value = size.y.toFixed(2);
    if (hInput) hInput.value = size.z.toFixed(2);

    applyObjectTransform(obj, {
      scale: { x: size.x, y: size.y, z: size.z },
    });
    requestAnimationFrame(() => updatePositionPanel());
    return true;
  }

  // ==========================================
  // HẠ SÁT MẶT ĐƯỜNG (GROUND ALIGNMENT)
  // ==========================================

    function isObjectBottomPivot(obj) {
    if (!obj) return false;

    // 1. Lựa chọn thủ công của người dùng trên bảng điều khiển
    const panel = document.getElementById(POSITION_PANEL_ID);
    const pivotSelect = panel?.querySelector('[data-role="box-pivot-mode"]');
    const userMode = pivotSelect
      ? pivotSelect.value
      : localStorage.getItem("auto-lwh-pivot-mode") || "auto";

    if (userMode === "bottom") return true;
    if (userMode === "center") return false;

    // 2. Tự động nhận diện qua cấu trúc hình học Three.js Geometry của Box
    if (obj.geometry) {
      if (!obj.geometry.boundingBox) {
        try {
          obj.geometry.computeBoundingBox?.();
        } catch (e) {}
      }
      const bbox = obj.geometry.boundingBox;
      if (bbox && typeof bbox.min?.z === "number" && typeof bbox.max?.z === "number") {
        // Nếu min.z >= -0.15 và max.z > 0.4: Tọa độ gốc z nằm ở đáy (Bottom-Center)
        if (bbox.min.z >= -0.15 && bbox.max.z > 0.4) {
          return true;
        }
        // Nếu min.z <= -0.2 và max.z >= 0.2: Tọa độ gốc z nằm ở tâm (Geometric Center)
        if (bbox.min.z <= -0.2 && bbox.max.z >= 0.2) {
          return false;
        }
      }
    }

    // 3. Kiểm tra các mesh con có bị dịch lên z = +0.5 không
    if (obj.children && obj.children.length > 0) {
      for (let i = 0; i < obj.children.length; i++) {
        const c = obj.children[i];
        if (c && c.position && c.position.z >= 0.35) {
          return true;
        }
      }
    }

    // 4. Kiểm tra các cờ đặc trưng của Basic AI Platform / Xtreme1
    if (
      obj.userData?.pivot === "bottom" ||
      obj.userData?.anchor === "bottom" ||
      obj.isBottomOrigin === true ||
      window.editor?.config?.boxOrigin === "bottom"
    ) {
      return true;
    }

    // 5. Heuristic thông minh: So sánh độ cao Z của box với mặt phẳng đường pc.ground.plane
    const halfH = (obj.scale?.z || 1.5) / 2;
    if (halfH >= 0.35 && typeof obj.position?.z === "number") {
      const pc = getPagePc();
      const plane = pc?.ground?.plane;
      if (
        plane &&
        plane.normal &&
        typeof plane.constant === "number" &&
        Math.abs(plane.normal.z) > 1e-4
      ) {
        const groundRef =
          (-plane.constant -
            plane.normal.x * obj.position.x -
            plane.normal.y * obj.position.y) /
          plane.normal.z;
        const distToPos = Math.abs(obj.position.z - groundRef);
        const distToCenterBottom = Math.abs(obj.position.z - halfH - groundRef);
        // Nếu position.z gần sát mặt đường hơn hẳn (distToPos < 25cm) trong khi (position.z - halfH) lún sâu dưới đất (> 45cm)
        if (distToPos < 0.25 && distToCenterBottom > 0.45) {
          return true;
        }
      }
    }

    return false;
  }

function getSavedGroundOffset() {
    const val = localStorage.getItem("auto-lwh-ground-offset");
    const num = parseFloat(val);
    return Number.isFinite(num) ? num : 0;
  }

  function detectGroundZ(targetX, targetY, curBottomZ, scaleX, scaleY) {
    const pc = getPagePc();
    const halfL = (scaleX || 2.0) / 2;
    const halfW = (scaleY || 1.8) / 2;
    const refZ = typeof curBottomZ === "number" ? curBottomZ : 0;

    // 1. Quét đám mây điểm LiDAR thực tế
    try {
      const groupPoints = pc?.groupPoints?.children?.[0];
      const posAttr = groupPoints?.geometry?.getAttribute("position");
      if (posAttr && posAttr.array && posAttr.count > 0) {
        const arr = posAttr.array;
        const count = posAttr.count;

        // Vành đai mặt đường nhựa xung quanh xe (Donut ring):
        // Nằm ngoài mép xe 15cm đến 1.2m để tránh hoàn toàn điểm thân xe, chỉ lấy điểm mặt đường
        const innerL = halfL + 0.15;
        const innerW = halfW + 0.15;
        const outerL = halfL + 1.2;
        const outerW = halfW + 1.2;

        const roadRingZ = [];
        const tireContactZ = [];

        const step = count > 120000 ? 2 : 1;
        for (let i = 0; i < count; i += step) {
          const idx = i * 3;
          const px = arr[idx];
          const py = arr[idx + 1];
          const pz = arr[idx + 2];

          const dx = Math.abs(px - targetX);
          const dy = Math.abs(py - targetY);

          // Chỉ xét các điểm có cao độ gần với đáy xe: [refZ - 0.6m, refZ + 0.5m]
          if (pz < refZ - 0.6 || pz > refZ + 0.5) continue;

          // A. Điểm thuộc vành đai mặt đường bao quanh xe (Donut Ring - chuẩn nhất vì là tia LiDAR quét trên mặt đường)
          if (dx <= outerL && dy <= outerW && (dx >= innerL || dy >= innerW)) {
            roadRingZ.push(pz);
          }

          // B. Điểm chân bánh xe bên dưới thân xe (Tire contact)
          if (dx <= halfL && dy <= halfW && pz <= refZ + 0.25) {
            tireContactZ.push(pz);
          }
        }

        // Ưu tiên 1: Lấy từ vành đai mặt đường nhựa xung quanh xe
        if (roadRingZ.length >= 3) {
          // Thích ứng cả khi ít điểm (Sparse)
          roadRingZ.sort((a, b) => a - b);
          // Lấy trung vị (median) của các điểm mặt đường
          const medianZ = roadRingZ[Math.floor(roadRingZ.length * 0.5)];
          return {
            groundZ: medianZ,
            source: "road-ring",
            pointsCount: roadRingZ.length,
          };
        }

        // Ưu tiên 2: Lấy điểm tiếp đất thấp nhất của bánh xe (vị trí lốp chạm đường)
        if (tireContactZ.length >= 2) {
          // Thích ứng cả khi ít điểm (Sparse)
          tireContactZ.sort((a, b) => a - b);
          // Lấy phân vị 8% để loại bỏ nhiễu âm và bắt đúng chân lốp tiếp đất
          const pIdx = Math.max(0, Math.floor(tireContactZ.length * 0.08));
          return {
            groundZ: tireContactZ[pIdx],
            source: "tire-contact",
            pointsCount: tireContactZ.length,
          };
        }
      }
    } catch (err) {
      console.warn("detectGroundZ point cloud scan error:", err);
    }

    // 2. Dự phòng: Dùng phương trình mặt phẳng đường chuẩn của Xtreme1 (editor.pc.ground.plane)
    try {
      const plane = pc?.ground?.plane;
      if (plane && plane.normal && typeof plane.constant === "number") {
        const nz = plane.normal.z;
        if (Math.abs(nz) > 1e-4) {
          const planeGroundZ =
            (-plane.constant -
              plane.normal.x * targetX -
              plane.normal.y * targetY) /
            nz;
          return {
            groundZ: planeGroundZ,
            source: "ground-plane",
            pointsCount: 0,
          };
        }
      }
    } catch (err) {
      console.warn("detectGroundZ ground plane error:", err);
    }

    // 3. Dự phòng cấp 3: Cấu hình config.pointHeight[0]
    try {
      const editor =
        window.editor || window.__APP__?.editor || window.app?.editor;
      const cfgHeight = editor?.state?.config?.pointHeight?.[0];
      if (typeof cfgHeight === "number") {
        return {
          groundZ: cfgHeight,
          source: "config-height",
          pointsCount: 0,
        };
      }
    } catch (err) {}

    return null;
  }

  function snapObjectToGround(obj, customOffset) {
    if (!obj || !obj.position || !obj.scale) return false;

    const panel = document.getElementById(POSITION_PANEL_ID);
    const offsetInput = panel?.querySelector(
      '[data-role="ground-offset-input"]',
    );
    const offset =
      typeof customOffset === "number"
        ? customOffset
        : offsetInput && Number.isFinite(parseFloat(offsetInput.value))
          ? parseFloat(offsetInput.value)
          : getSavedGroundOffset();

    const halfH = (obj.scale.z || 1.5) / 2;
    const isBottom = isObjectBottomPivot(obj);
    const curBottomZ = isBottom ? obj.position.z : obj.position.z - halfH;

    const detected = detectGroundZ(
      obj.position.x,
      obj.position.y,
      curBottomZ,
      obj.scale.x,
      obj.scale.y,
    );

    if (!detected || typeof detected.groundZ !== "number") {
      const badge = panel?.querySelector('[data-role="ground-diff-badge"]');
      if (badge) {
        badge.textContent = "Không tìm thấy đường";
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
      return false;
    }

    const newPosZ = isBottom
      ? detected.groundZ + offset
      : detected.groundZ + halfH + offset;

    applyObjectTransform(obj, {
      position: {
        x: obj.position.x,
        y: obj.position.y,
        z: newPosZ,
      },
    });

    const pc = getPagePc();
    if (pc && typeof pc.selectObject === "function") {
      pc.selectObject(obj);
    }

    updatePositionPanel();
    requestAnimationFrame(() => updatePositionPanel());
    return true;
  }

  // ==========================================
  // CĂN CHỈNH OVERHEAD (L-SHAPE & YAW SNAPPING)
  // ==========================================

  function snapObjectOverhead(obj) {
    if (!obj || !obj.position || !obj.scale || !obj.rotation) return false;

    const panel = document.getElementById(POSITION_PANEL_ID);
    const badge = panel?.querySelector('[data-role="overhead-fit-badge"]');

    try {
      const pc = getPagePc();
      const groupPoints = pc?.groupPoints?.children?.[0];
      const posAttr = groupPoints?.geometry?.getAttribute("position");
      if (!posAttr || !posAttr.array || posAttr.count === 0) {
        if (badge) {
          badge.textContent = "Không có điểm";
          badge.style.background = "#7f1d1d";
          badge.style.color = "#fca5a5";
        }
        return false;
      }

      const arr = posAttr.array;
      const count = posAttr.count;

      const boxX = obj.position.x;
      const boxY = obj.position.y;
      const boxZ = obj.position.z;
      const boxYaw = obj.rotation.z || 0;

      const halfL = (obj.scale.x || 4.0) / 2;
      const halfW = (obj.scale.y || 2.0) / 2;
      const halfH = (obj.scale.z || 1.6) / 2;

      const cosB = Math.cos(boxYaw);
      const sinB = Math.sin(boxYaw);

      const isBottom = isObjectBottomPivot(obj);
      const centerZ = isBottom ? boxZ + halfH : boxZ;

      // 1. Thu thập điểm LiDAR trong phạm vi box (kèm lề 0.45m)
      const cand = [];
      const step = count > 120000 ? 2 : 1;
      for (let i = 0; i < count; i += step) {
        const idx = i * 3;
        const px = arr[idx];
        const py = arr[idx + 1];
        const pz = arr[idx + 2];

        // Lọc cao độ Z trong khoảng thân xe:
        // Loại bỏ hoàn toàn mặt đường (dưới -halfH + 0.15m) để tránh nhiễu mặt đường
        // và không vượt quá nóc xe + 0.25m
        const zRel = pz - centerZ;
        if (zRel < -halfH + 0.15 || zRel > halfH + 0.25) continue;

        // Đưa về tọa độ cục bộ 2D của box (giữ nguyên góc Yaw của người dùng)
        const dx = px - boxX;
        const dy = py - boxY;
        const lx = dx * cosB + dy * sinB;
        const ly = -dx * sinB + dy * cosB;

        if (Math.abs(lx) <= halfL + 0.45 && Math.abs(ly) <= halfW + 0.45) {
          cand.push({ lx, ly });
        }
      }

      // Hỗ trợ thích ứng thông minh (Adaptive): chỉ cần từ 2 điểm là có thể hút
      if (cand.length < 2) {
        if (badge) {
          badge.textContent = `Quá ít điểm (${cand.length} pts)`;
          badge.style.background = "#713f12";
          badge.style.color = "#fde047";
        }
        return false;
      }

      const isSparse = cand.length < 7; // Chế độ LiDAR thưa (xe ở xa)

      // Hàm trích xuất mép ngoài siêu khít, có khả năng loại bỏ hạt bụi bay lạc
      function getOuterEdge(vals, isMin) {
        if (!vals || vals.length === 0) return 0;
        const sorted = vals.slice().sort((a, b) => a - b);
        const n = sorted.length;
        if (n === 1) return sorted[0];
        if (n === 2) return isMin ? sorted[0] : sorted[1];

        if (isMin) {
          // Tìm mép âm nhất (Đuôi xe ở -X, hoặc Sườn phải ở -Y)
          // Nếu điểm ngoài cùng s[0] cách điểm kế tiếp s[1] > 20cm -> là hạt bụi bay lạc, bỏ s[0]
          if (sorted[1] - sorted[0] > 0.20) {
            return sorted[1];
          }
          // Trung bình 2 điểm ngoài cùng để ôm phẳng lì theo bề mặt kim loại xe
          return (sorted[0] + sorted[1]) / 2;
        } else {
          // Tìm mép dương nhất (Đầu xe ở +X, hoặc Sườn trái ở +Y)
          if (sorted[n - 1] - sorted[n - 2] > 0.20) {
            return sorted[n - 2];
          }
          return (sorted[n - 1] + sorted[n - 2]) / 2;
        }
      }

      // 2. Tách điểm sườn (Side) và điểm đuôi/đầu (Bumper)
      const marginX = isSparse ? halfL - 0.10 : halfL - 0.15;
      const leftSide = cand.filter(
        (p) => p.ly > 0.15 && Math.abs(p.lx) < marginX,
      );
      const rightSide = cand.filter(
        (p) => p.ly < -0.15 && Math.abs(p.lx) < marginX,
      );

      let dominantSide = null;
      if (leftSide.length >= 3 && rightSide.length >= 3) {
        dominantSide = "dual";
      } else if (leftSide.length > 0 || rightSide.length > 0) {
        if (leftSide.length > rightSide.length * 1.3) {
          dominantSide = "left";
        } else if (rightSide.length > leftSide.length * 1.3) {
          dominantSide = "right";
        } else {
          dominantSide = leftSide.length >= rightSide.length ? "left" : "right";
        }
      }

      // 3. Căn mép sườn xe (Lateral shift: deltaY) - KHÔNG ĐỔI GÓC XOAY (YAW)
      let deltaY = 0;
      if (dominantSide === "dual") {
        // Có điểm ở cả 2 sườn: Căn giữa 2 bên để khoảng cách 2 bên cân đối nhất
        const leftEdge = getOuterEdge(leftSide.map((p) => p.ly), false);
        const rightEdge = getOuterEdge(rightSide.map((p) => p.ly), true);
        deltaY = (leftEdge + rightEdge) / 2;
      } else if (dominantSide === "left") {
        // Chỉ nhìn thấy sườn trái (dạng chữ L góc nhìn chéo)
        const leftEdge = getOuterEdge(leftSide.map((p) => p.ly), false);
        deltaY = leftEdge - halfW;
      } else if (dominantSide === "right") {
        // Chỉ nhìn thấy sườn phải
        const rightEdge = getOuterEdge(rightSide.map((p) => p.ly), true);
        deltaY = rightEdge - -halfW;
      }

      // 4. Căn mép đuôi / đầu (Longitudinal shift: deltaX)
      const rearMarginY = isSparse ? halfW - 0.05 : halfW - 0.10;
      const rearPts = cand.filter(
        (p) => p.lx < -0.15 && Math.abs(p.ly) < rearMarginY,
      );
      const frontPts = cand.filter(
        (p) => p.lx > 0.15 && Math.abs(p.ly) < rearMarginY,
      );

      let deltaX = 0;
      if (rearPts.length >= 3 && frontPts.length >= 3) {
        // Nhìn thấy cả đầu và đuôi
        const rEdge = getOuterEdge(rearPts.map((p) => p.lx), true);
        const fEdge = getOuterEdge(frontPts.map((p) => p.lx), false);
        deltaX = (rEdge + fEdge) / 2;
      } else if (rearPts.length >= 1) {
        // Chủ yếu nhìn thấy đuôi xe (góc nhìn từ sau tới)
        const rEdge = getOuterEdge(rearPts.map((p) => p.lx), true);
        deltaX = rEdge - -halfL;
      } else if (frontPts.length >= 1) {
        // Chủ yếu nhìn thấy đầu xe
        const fEdge = getOuterEdge(frontPts.map((p) => p.lx), false);
        deltaX = fEdge - halfL;
      }

      // Giới hạn dịch chuyển tối đa thích ứng:
      // Khi ít điểm (xe ở xa), siết chặt biên độ tối đa (40cm/35cm) để dù có 1 điểm bay lạc cũng không giật box đi xa
      const maxShiftX = isSparse ? 0.40 : 0.85;
      const maxShiftY = isSparse ? 0.35 : 0.65;

      deltaX = Math.max(-maxShiftX, Math.min(maxShiftX, deltaX));
      deltaY = Math.max(-maxShiftY, Math.min(maxShiftY, deltaY));

      // 5. Chuyển dịch chuyển local về tọa độ thế giới (World space) - Giữ nguyên góc boxYaw
      const shiftWx = deltaX * cosB - deltaY * sinB;
      const shiftWy = deltaX * sinB + deltaY * cosB;

      const newPos = {
        x: boxX + shiftWx,
        y: boxY + shiftWy,
        z: boxZ,
      };

      // Áp dụng vị trí mới (KHÔNG thay đổi rotation)
      applyObjectTransform(obj, {
        position: newPos,
      });

      const pcInstance = getPagePc();
      if (pcInstance && typeof pcInstance.selectObject === "function") {
        pcInstance.selectObject(obj);
      }

      // Làm mới các khung nhìn Side Views để cập nhật vị trí mới
      if (pcInstance && Array.isArray(pcInstance.renderViews)) {
        pcInstance.renderViews.forEach((view) => {
          if (view && typeof view.fitObject === "function") {
            view.needFit = true;
            view.enableFit = true;
            view.fitObject(obj);
            view.render?.();
          }
        });
      }

      if (badge) {
        const modeLabel = isSparse ? "Hút thưa" : "Hút khít";
        badge.textContent = `🟢 ${modeLabel} (${cand.length} pts)`;
        badge.style.background = "#065f46";
        badge.style.color = "#a7f3d0";
        const sideDetail =
          dominantSide === "dual"
            ? `Cân đối 2 sườn: ${(deltaY * 100).toFixed(1)}cm`
            : dominantSide
            ? `Sườn ${dominantSide === "left" ? "Trái" : "Phải"}: ${(deltaY * 100).toFixed(1)}cm`
            : "Không có điểm sườn";
        const rearDetail = `Đuôi: ${(deltaX * 100).toFixed(1)}cm`;
        badge.title = `Chế độ: ${isSparse ? "Sparse (Ít điểm)" : "Dense (Dày điểm)"} (${cand.length} điểm). ${sideDetail}, ${rearDetail}. Giữ nguyên góc xoay.`;
      }

      updatePositionPanel();
      requestAnimationFrame(() => updatePositionPanel());
      return true;
    } catch (err) {
      console.warn("snapObjectOverhead error:", err);
      if (badge) {
        badge.textContent = "Lỗi xử lý";
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
      return false;
    }
  }

  function snapObjectAll(obj) {
    if (!obj) return false;
    snapObjectOverhead(obj);
    setTimeout(() => {
      snapObjectToGround(obj);
    }, 50);
    return true;
  }

  function snapObjectSignboard(obj) {
    if (!obj || !obj.position || !obj.scale || !obj.rotation) return false;

    const panel = document.getElementById(POSITION_PANEL_ID);
    const badge = panel?.querySelector('[data-role="signboard-fit-badge"]');
    const fitSizeCheckbox = panel?.querySelector(
      '[data-role="signboard-fit-size"]',
    );
    const isFitSize = fitSizeCheckbox ? fitSizeCheckbox.checked : true;

    try {
      const pc = getPagePc();
      const groupPoints = pc?.groupPoints?.children?.[0];
      const posAttr = groupPoints?.geometry?.getAttribute("position");
      if (!posAttr || !posAttr.array || posAttr.count === 0) {
        if (badge) {
          badge.textContent = "Không có điểm";
          badge.style.background = "#7f1d1d";
          badge.style.color = "#fca5a5";
        }
        return false;
      }

      const arr = posAttr.array;
      const count = posAttr.count;

      const boxX = obj.position.x;
      const boxY = obj.position.y;
      const boxZ = obj.position.z;
      const boxYaw = obj.rotation.z || 0;

      const halfL = (obj.scale.x || 0.4) / 2;
      const halfW = (obj.scale.y || 0.8) / 2;
      const halfH = (obj.scale.z || 0.8) / 2;

      const cosB = Math.cos(boxYaw);
      const sinB = Math.sin(boxYaw);

      // 1. Quét các điểm LiDAR trong phạm vi box biển báo (kèm lề 0.35m xung quanh)
      const cand = [];
      const step = count > 120000 ? 2 : 1;
      const maxR = Math.max(halfL, halfW, halfH) + 0.35;

      for (let i = 0; i < count; i += step) {
        const idx = i * 3;
        const px = arr[idx];
        const py = arr[idx + 1];
        const pz = arr[idx + 2];

        const dx = px - boxX;
        const dy = py - boxY;
        const dz = pz - boxZ;

        if (Math.abs(dx) > maxR || Math.abs(dy) > maxR || Math.abs(dz) > maxR)
          continue;

        // Chuyển về tọa độ cục bộ của box
        const lx = dx * cosB + dy * sinB;
        const ly = -dx * sinB + dy * cosB;
        const lz = dz;

        if (
          Math.abs(lx) <= halfL + 0.25 &&
          Math.abs(ly) <= halfW + 0.25 &&
          Math.abs(lz) <= halfH + 0.25
        ) {
          cand.push({ lx, ly, lz });
        }
      }

      if (cand.length < 2) {
        if (badge) {
          badge.textContent = `Quá ít điểm (${cand.length} pts)`;
          badge.style.background = "#713f12";
          badge.style.color = "#fde047";
        }
        return false;
      }

      // 2. Tìm trọng tâm 3D (center) của cụm điểm biển báo trên cao
      const sortedX = cand.map((p) => p.lx).sort((a, b) => a - b);
      const sortedY = cand.map((p) => p.ly).sort((a, b) => a - b);
      const sortedZ = cand.map((p) => p.lz).sort((a, b) => a - b);
      const N = cand.length;

      let cLx = 0,
        cLy = 0,
        cLz = 0;
      let spanY = 0,
        spanZ = 0;

      if (N >= 6) {
        // Nhiều điểm: dùng phân vị 5% và 95% để khử nhiễu tuyệt đối
        const x0 = sortedX[Math.floor(N * 0.05)],
          x1 = sortedX[Math.floor(N * 0.95)];
        const y0 = sortedY[Math.floor(N * 0.05)],
          y1 = sortedY[Math.floor(N * 0.95)];
        const z0 = sortedZ[Math.floor(N * 0.05)],
          z1 = sortedZ[Math.floor(N * 0.95)];
        cLx = (x0 + x1) / 2;
        cLy = (y0 + y1) / 2;
        cLz = (z0 + z1) / 2;
        spanY = y1 - y0;
        spanZ = z1 - z0;
      } else {
        // Ít điểm (Sparse): dùng min/max
        const x0 = sortedX[0],
          x1 = sortedX[N - 1];
        const y0 = sortedY[0],
          y1 = sortedY[N - 1];
        const z0 = sortedZ[0],
          z1 = sortedZ[N - 1];
        cLx = (x0 + x1) / 2;
        cLy = (y0 + y1) / 2;
        cLz = (z0 + z1) / 2;
        spanY = y1 - y0;
        spanZ = z1 - z0;
      }

      // Giới hạn dịch chuyển tối đa để an toàn (không bị văng xa)
      cLx = Math.max(-0.45, Math.min(0.45, cLx));
      cLy = Math.max(-0.45, Math.min(0.45, cLy));
      cLz = Math.max(-0.45, Math.min(0.45, cLz));

      // 3. Đưa dịch chuyển về tọa độ thế giới (bảo toàn cao độ Z trên không)
      const shiftWx = cLx * cosB - cLy * sinB;
      const shiftWy = cLx * sinB + cLy * cosB;
      const shiftWz = cLz;

      const newPos = {
        x: boxX + shiftWx,
        y: boxY + shiftWy,
        z: boxZ + shiftWz,
      };

      // 4. Nếu bật tự ôm khít kích thước W, H (kèm lề an toàn 5cm)
      const payload = { position: newPos };
      if (isFitSize && spanY >= 0.15 && spanZ >= 0.15) {
        const newScale = obj.scale.clone();
        newScale.y = Math.max(0.2, Math.min(3.0, +(spanY + 0.06).toFixed(2)));
        newScale.z = Math.max(0.2, Math.min(3.0, +(spanZ + 0.06).toFixed(2)));
        payload.scale = newScale;
      }

      applyObjectTransform(obj, payload);

      const pcInstance = getPagePc();
      if (pcInstance && typeof pcInstance.selectObject === "function") {
        pcInstance.selectObject(obj);
      }

      // Làm mới khung nhìn Side Views
      if (pcInstance && Array.isArray(pcInstance.renderViews)) {
        pcInstance.renderViews.forEach((view) => {
          if (view && typeof view.fitObject === "function") {
            view.needFit = true;
            view.enableFit = true;
            view.fitObject(obj);
            view.render?.();
          }
        });
      }

      if (badge) {
        badge.textContent = `🟢 Đã ôm biển (${N} pts)`;
        badge.style.background = "#065f46";
        badge.style.color = "#a7f3d0";
        badge.title = `Đã căn tâm 3D (X, Y, Z) và ôm khít bảng biển (${N} điểm). Giữ nguyên cao độ trên cao.`;
      }

      updatePositionPanel();
      requestAnimationFrame(() => updatePositionPanel());
      return true;
    } catch (err) {
      console.warn("snapObjectSignboard error:", err);
      if (badge) {
        badge.textContent = "Lỗi xử lý";
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
      return false;
    }
  }

  // ==========================================
  // TÍNH ĐỘ CAO Z THEO ID THAM CHIẾU (Z + H)
  // ==========================================

  function getAll3DObjects() {
    const pc = getPagePc();
    if (pc && typeof pc.getAnnotate3D === "function") {
      const arr = pc.getAnnotate3D();
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
    if (
      pc &&
      pc.annotate3D &&
      Array.isArray(pc.annotate3D.children) &&
      pc.annotate3D.children.length > 0
    ) {
      return pc.annotate3D.children;
    }
    const editor = window.editor || window.__APP__?.editor || window.app?.editor;
    if (
      editor &&
      editor.dataManager &&
      editor.state &&
      Array.isArray(editor.state.frames)
    ) {
      const curFrame = editor.state.frames[editor.state.frameIndex];
      if (curFrame && typeof editor.dataManager.getFrameObject === "function") {
        const frameObjs = editor.dataManager.getFrameObject(curFrame.id);
        if (Array.isArray(frameObjs) && frameObjs.length > 0) return frameObjs;
      }
    }
    return [];
  }

  function findObjectByRefId(queryId) {
    if (!queryId) return null;
    const q = String(queryId).trim().toLowerCase().replace(/^#/, "");
    if (!q) return null;
    const objs = getAll3DObjects();

    // 1. Khớp chính xác trackName (ví dụ "1")
    let found = objs.find((o) => {
      const tn = String(o?.userData?.trackName ?? "")
        .trim()
        .toLowerCase()
        .replace(/^#/, "");
      return tn === q;
    });
    if (found) return found;

    // 2. Khớp chính xác trackId (ví dụ "jhMwsRajl9h1UGB0")
    found = objs.find((o) => {
      const tid = String(o?.userData?.trackId ?? "")
        .trim()
        .toLowerCase();
      return tid === q;
    });
    if (found) return found;

    // 3. Khớp ID hoặc UUID
    found = objs.find((o) => {
      const id = String(o?.userData?.id ?? o?.id ?? o?.uuid ?? "")
        .trim()
        .toLowerCase();
      return id === q || id.startsWith(q);
    });
    if (found) return found;

    // 4. Tìm kiếm chứa chuỗi trong tên track
    found = objs.find((o) => {
      const str = `${o?.userData?.trackName || ""} ${o?.userData?.trackId || ""}`.toLowerCase();
      return str.includes(q);
    });
    return found || null;
  }

  function getRefGapKey(mode) {
    if (mode === "line") return "auto-lwh-ref-gap-line";
    if (mode === "axis_x") return "auto-lwh-ref-gap-axis-x";
    if (mode === "axis_y") return "auto-lwh-ref-gap-axis-y";
    if (mode === "left" || mode === "right") return "auto-lwh-ref-gap-side";
    if (mode === "front" || mode === "behind") return "auto-lwh-ref-gap-front";
    if (mode === "ground") return "auto-lwh-ref-gap-ground";
    if (mode === "bottom") return "auto-lwh-ref-gap-bottom";
    return "auto-lwh-ref-gap-top";
  }

  function getSavedRefGap(mode) {
    const key = getRefGapKey(mode);
    const saved = localStorage.getItem(key);
    if (saved !== null && Number.isFinite(parseFloat(saved))) {
      return parseFloat(saved);
    }
    return 0.00;
  }

  function setSavedRefGap(mode, val) {
    const key = getRefGapKey(mode);
    const num = Number.isFinite(parseFloat(val)) ? parseFloat(val) : 0.00;
    localStorage.setItem(key, String(num));
    return num;
  }

  function getSavedRefMode() {
    return localStorage.getItem("auto-lwh-ref-mode") || "top";
  }

  function setSavedRefMode(mode) {
    localStorage.setItem("auto-lwh-ref-mode", mode || "top");
  }

  function applyRefZ(targetObj) {
    const obj = targetObj || getSelectedObject();
    const panel = document.getElementById(POSITION_PANEL_ID);
    const badge = panel?.querySelector('[data-role="ref-z-badge"]');
    const refInput = panel?.querySelector('[data-role="ref-id-input"]');
    const modeSelect = panel?.querySelector('[data-role="ref-sync-mode"]');
    const gapInput = panel?.querySelector('[data-role="ref-gap-input"]');
    const refId = refInput?.value?.trim();

    if (!refId) {
      if (badge) {
        badge.textContent = "Chưa nhập ID";
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
      return false;
    }

    if (!obj || !obj.position || !obj.scale) {
      if (badge) {
        badge.textContent = "Chưa chọn box";
        badge.style.background = "#713f12";
        badge.style.color = "#fde047";
      }
      return false;
    }

    const refObj = findObjectByRefId(refId);
    if (!refObj || !refObj.position || !refObj.scale) {
      if (badge) {
        badge.textContent = `Ko thấy ID: ${refId}`;
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
      return false;
    }

    // Không tự tham chiếu chính nó
    if (refObj === obj || (obj.uuid && refObj.uuid && obj.uuid === refObj.uuid)) {
      if (badge) {
        badge.textContent = "Trùng box đang chọn";
        badge.style.background = "#713f12";
        badge.style.color = "#fde047";
      }
      return false;
    }

    const mode = modeSelect?.value || getSavedRefMode() || "top";
    const gapVal = gapInput && Number.isFinite(parseFloat(gapInput.value))
      ? parseFloat(gapInput.value)
      : getSavedRefGap(mode);

    const refX = Number(refObj.position.x) || 0;
    const refY = Number(refObj.position.y) || 0;
    const refZ = Number(refObj.position.z) || 0;
    const refL = Number(refObj.scale.x) || 4.0;
    const refW = Number(refObj.scale.y) || 2.0;
    const refH = Number(refObj.scale.z) || 1.6;

    const targetL = Number(obj.scale.x) || refL;
    const targetW = Number(obj.scale.y) || refW;
    const targetH = Number(obj.scale.z) || refH;

    // Khoảng cách dịch chuyển (nếu 2 box cùng size thì dist đúng bằng refH, refL, refW)
    const distH = (refH + targetH) / 2 + gapVal;
    const distL = (refL + targetL) / 2 + gapVal;
    const distW = (refW + targetW) / 2 + gapVal;

    const refYaw = (refObj.rotation && Number.isFinite(refObj.rotation.z)) ? refObj.rotation.z : 0;
    const cosB = Math.cos(refYaw);
    const sinB = Math.sin(refYaw);

    let newX = refX;
    let newY = refY;
    let newZ = refZ;
    let badgeText = "";

    const gapSign = gapVal >= 0 ? `+${gapVal.toFixed(2)}` : `${gapVal.toFixed(2)}`;

    if (mode === "offset") {
      // 🎯 Giữ cự ly / vector khoảng cách chuẩn
      const rel = getSavedConeRelation();
      if (rel && (Number.isFinite(rel.deltaX) || Number.isFinite(rel.deltaY))) {
        if (Number.isFinite(rel.localDx) && Number.isFinite(rel.localDy) && Number.isFinite(rel.refYaw)) {
          const dYaw = refYaw - (rel.refYaw || 0);
          const cosD = Math.cos(dYaw);
          const sinD = Math.sin(dYaw);
          newX = refX + (rel.deltaX * cosD - rel.deltaY * sinD);
          newY = refY + (rel.deltaX * sinD + rel.deltaY * cosD);
        } else {
          newX = refX + (rel.deltaX || 0);
          newY = refY + (rel.deltaY || 0);
        }
        newZ = refZ + (rel.deltaZ || 0);
        badgeText = `🟢 Giữ ΔX, ΔY (#${refId})`;
      } else {
        const dx = (obj.position?.x ?? refX) - refX;
        const dy = (obj.position?.y ?? refY) - refY;
        const dz = (obj.position?.z ?? refZ) - refZ;
        newX = refX + dx;
        newY = refY + dy;
        newZ = refZ + dz;
        badgeText = `🟢 Tọa độ hiện tại (#${refId})`;
      }
    } else if (mode === "line") {
      // ➡️ Nối thẳng A → B (theo vector hướng từ Cone A tới Cone B)
      const dx = (obj.position?.x ?? refX) - refX;
      const dy = (obj.position?.y ?? refY) - refY;
      const curDist2D = Math.hypot(dx, dy);

      let ux = 1;
      let uy = 0;
      if (curDist2D > 1e-4) {
        ux = dx / curDist2D;
        uy = dy / curDist2D;
      } else {
        ux = cosB;
        uy = sinB;
      }

      // Khoảng cách tâm-tâm = nửa kích thước 2 vật thể + độ hở
      const radiusRef = Math.max(refL, refW) / 2;
      const radiusTarget = Math.max(targetL, targetW) / 2;
      const centerDist = radiusRef + radiusTarget + gapVal;

      newX = refX + centerDist * ux;
      newY = refY + centerDist * uy;
      newZ = refZ;
      badgeText = `🟢 Nối A→B (${gapSign}m #${refId})`;
    } else if (mode === "axis_x") {
      // ↔️ Theo trục X: Tự nhận biết B đang nằm bên phải (+X) hay bên trái (-X) của A
      const dirX = (obj.position?.x ?? refX) >= refX ? 1 : -1;
      newX = refX + dirX * distL;
      newY = refY;
      newZ = refZ;
      badgeText = `🟢 Trục X (${gapSign}m #${refId})`;
    } else if (mode === "axis_y") {
      // ↕️ Theo trục Y: Tự nhận biết B đang nằm phía trên (+Y) hay phía dưới (-Y) của A
      const dirY = (obj.position?.y ?? refY) >= refY ? 1 : -1;
      newX = refX;
      newY = refY + dirY * distW;
      newZ = refZ;
      badgeText = `🟢 Trục Y (${gapSign}m #${refId})`;
    } else if (mode === "top") {
      // ⚡ Trên đỉnh: Z + H, giữ nguyên X Y
      newX = refX;
      newY = refY;
      newZ = refZ + distH;
      badgeText = `🟢 Đỉnh (${gapSign}m #${refId})`;
    } else if (mode === "bottom") {
      // 🕳️ Dưới đáy: Z - H, giữ nguyên X Y
      newX = refX;
      newY = refY;
      newZ = refZ - distH;
      badgeText = `🟢 Đáy (${gapSign}m #${refId})`;
    } else if (mode === "front") {
      // ▲ Trước mặt: +L theo Yaw, giữ nguyên Z
      newX = refX + distL * cosB;
      newY = refY + distL * sinB;
      newZ = refZ;
      badgeText = `🟢 Trước (${gapSign}m #${refId})`;
    } else if (mode === "behind") {
      // ▼ Sau lưng: -L theo Yaw, giữ nguyên Z
      newX = refX - distL * cosB;
      newY = refY - distL * sinB;
      newZ = refZ;
      badgeText = `🟢 Sau (${gapSign}m #${refId})`;
    } else if (mode === "left") {
      // ◀️ Bên Trái: +W theo Yaw (sườn trái), giữ nguyên Z
      newX = refX - distW * sinB;
      newY = refY + distW * cosB;
      newZ = refZ;
      badgeText = `🟢 Trái (${gapSign}m #${refId})`;
    } else if (mode === "right") {
      // ▶️ Bên Phải: -W theo Yaw (sườn phải), giữ nguyên Z
      newX = refX + distW * sinB;
      newY = refY - distW * cosB;
      newZ = refZ;
      badgeText = `🟢 Phải (${gapSign}m #${refId})`;
    } else if (mode === "ground") {
      // 📏 Cùng độ cao: Lấy X = X_0, Y = Y_0, Z = Z_0 + gapVal (tương tự các trường hợp khác)
      newX = refX;
      newY = refY;
      newZ = refZ + gapVal;
      badgeText = `🟢 Cùng Z (${gapSign}m #${refId})`;
    } else {
      newX = refX;
      newY = refY;
      newZ = refZ + distH;
      badgeText = `🟢 Đỉnh (${gapSign}m #${refId})`;
    }

    newX = Number(newX.toFixed(3));
    newY = Number(newY.toFixed(3));
    newZ = Number(newZ.toFixed(3));

    // Chỉ đồng bộ tọa độ (Position), giữ nguyên góc xoay (Rotation) của đối tượng
    const transformPayload = {
      position: { x: newX, y: newY, z: newZ },
    };

    applyObjectTransform(obj, transformPayload);

    const pcInstance = getPagePc();
    if (pcInstance && typeof pcInstance.selectObject === "function") {
      pcInstance.selectObject(obj);
    }

    // Làm mới khung nhìn Side Views
    if (pcInstance && Array.isArray(pcInstance.renderViews)) {
      pcInstance.renderViews.forEach((view) => {
        if (view && typeof view.fitObject === "function") {
          view.needFit = true;
          view.enableFit = true;
          view.fitObject(obj);
          view.render?.();
        }
      });
    }

    if (badge) {
      badge.textContent = badgeText;
      badge.style.background = "#065f46";
      badge.style.color = "#a7f3d0";
      badge.title = `ID ${refId} (${mode}): X=${newX.toFixed(2)}, Y=${newY.toFixed(2)}, Z=${newZ.toFixed(2)}m | Hở: ${gapVal.toFixed(2)}m`;
    }

    saveCurrentConeRelation(obj);
    updatePositionPanel();
    requestAnimationFrame(() => updatePositionPanel());
    return true;
  }

  let lastAutoZBoxUuid = null;

  function checkAutoApplyRefZ() {
    const panel = document.getElementById(POSITION_PANEL_ID);
    const checkbox = panel?.querySelector('[data-role="auto-ref-z-checkbox"]');
    if (!checkbox || !checkbox.checked) return;

    const refInput = panel?.querySelector('[data-role="ref-id-input"]');
    const refId = refInput?.value?.trim();
    if (!refId) return;

    const curObj = getSelectedObject();
    if (!curObj || !curObj.position || !curObj.scale) return;

    const uuid =
      curObj.uuid || curObj.id || `${curObj.position.x}_${curObj.position.y}`;
    if (lastAutoZBoxUuid === uuid) return;
    lastAutoZBoxUuid = uuid;

    // Không tự gán cho chính refObj
    const refObj = findObjectByRefId(refId);
    if (refObj && (refObj === curObj || refObj.uuid === curObj.uuid)) return;

    applyRefZ(curObj);
  }

  // ==========================================
  // LƯU QUAN HỆ & SINH CONE B QUA CÁC FRAME
  // ==========================================

  let lastConeRelation = null;

  function saveCurrentConeRelation(targetObj) {
    const curObj = targetObj || getSelectedObject();
    const panel = document.getElementById(POSITION_PANEL_ID);
    const refInput = panel?.querySelector('[data-role="ref-id-input"]');
    const modeSelect = panel?.querySelector('[data-role="ref-sync-mode"]');
    const gapInput = panel?.querySelector('[data-role="ref-gap-input"]');
    const refId = refInput?.value?.trim();
    const curFrameNum = getCurrentFrameNumber() || 1;

    if (!curObj || !refId) return null;
    const refObj = findObjectByRefId(refId);
    if (!refObj || refObj === curObj || (refObj.uuid && curObj.uuid && refObj.uuid === curObj.uuid)) return null;

    const dx = (curObj.position?.x || 0) - (refObj.position?.x || 0);
    const dy = (curObj.position?.y || 0) - (refObj.position?.y || 0);
    const dz = (curObj.position?.z || 0) - (refObj.position?.z || 0);
    const dist2D = Math.hypot(dx, dy);
    const dist3D = Math.hypot(dx, dy, dz);

    const radiusRef = Math.max(refObj.scale?.x || 0.41, refObj.scale?.y || 0.41) / 2;
    const radiusTarget = Math.max(curObj.scale?.x || 0.41, curObj.scale?.y || 0.41) / 2;
    const measuredEdgeGap = Math.max(0, dist2D - radiusRef - radiusTarget);

    const mode = modeSelect?.value || getSavedRefMode() || "offset";
    const gapVal = gapInput && Number.isFinite(parseFloat(gapInput.value))
      ? parseFloat(gapInput.value)
      : (measuredEdgeGap || 0);

    const refYaw = (refObj.rotation && Number.isFinite(refObj.rotation.z)) ? refObj.rotation.z : 0;
    const cosRef = Math.cos(-refYaw);
    const sinRef = Math.sin(-refYaw);
    const localDx = cosRef * dx - sinRef * dy;
    const localDy = sinRef * dx + cosRef * dy;

    const prevRel = getSavedConeRelation();
    const benchmarkFrame = prevRel?.benchmarkFrame || curFrameNum;

    lastConeRelation = {
      benchmarkFrame: benchmarkFrame,
      refTrackName: String(refObj.userData?.trackName || refId),
      refTrackId: String(refObj.userData?.trackId || ""),
      refYaw: refYaw,
      targetTrackName: String(curObj.userData?.trackName || curObj.userData?.trackId || "B"),
      targetTrackId: String(curObj.userData?.trackId || ""),
      classType: curObj.userData?.classType || "traffic_cone",
      classId: curObj.userData?.classId || "",
      scale: {
        x: curObj.scale?.x || 0.41,
        y: curObj.scale?.y || 0.41,
        z: curObj.scale?.z || 0.41,
      },
      rotation: {
        x: curObj.rotation?.x || 0,
        y: curObj.rotation?.y || 0,
        z: curObj.rotation?.z || 0,
        order: curObj.rotation?.order || "XYZ",
      },
      mode: mode,
      gap: Number(gapVal.toFixed(3)),
      deltaX: Number(dx.toFixed(3)),
      deltaY: Number(dy.toFixed(3)),
      deltaZ: Number(dz.toFixed(3)),
      localDx: Number(localDx.toFixed(3)),
      localDy: Number(localDy.toFixed(3)),
      dist2D: Number(dist2D.toFixed(3)),
      dist3D: Number(dist3D.toFixed(3)),
      unitX: dist2D > 1e-4 ? dx / dist2D : 1,
      unitY: dist2D > 1e-4 ? dy / dist2D : 0,
    };

    localStorage.setItem("auto-lwh-cone-relation", JSON.stringify(lastConeRelation));
    return lastConeRelation;
  }

  function getSavedConeRelation() {
    if (lastConeRelation) return lastConeRelation;
    try {
      const raw = localStorage.getItem("auto-lwh-cone-relation");
      if (raw) {
        lastConeRelation = JSON.parse(raw);
        return lastConeRelation;
      }
    } catch (_) {}
    return null;
  }

  function lockBenchmarkRelation() {
    const panel = document.getElementById(POSITION_PANEL_ID);
    const curObj = getSelectedObject();
    const refInput = panel?.querySelector('[data-role="ref-id-input"]');
    const badge = panel?.querySelector('[data-role="ref-z-badge"]');
    const gapInput = panel?.querySelector('[data-role="ref-gap-input"]');
    const curFrameNum = getCurrentFrameNumber() || 1;

    if (!curObj) {
      if (badge) {
        badge.textContent = "Chưa chọn Cone B";
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
      alert("Vui lòng click chọn Cone B trước khi chốt làm chuẩn!");
      return false;
    }

    let refId = refInput?.value?.trim();
    let refObj = refId ? findObjectByRefId(refId) : null;

    if (!refObj) {
      const allObjs = getAll3DObjects().filter(
        (o) => o !== curObj && o.uuid !== curObj.uuid && o.position
      );
      if (allObjs.length === 1) {
        refObj = allObjs[0];
        refId = refObj.userData?.trackName || refObj.userData?.trackId || "1";
        if (refInput) refInput.value = refId;
      } else {
        alert("Vui lòng chọn Cone A rồi bấm nút 📌 để ghim ID tham chiếu!");
        return false;
      }
    }

    const dx = (curObj.position?.x || 0) - (refObj.position?.x || 0);
    const dy = (curObj.position?.y || 0) - (refObj.position?.y || 0);
    const dz = (curObj.position?.z || 0) - (refObj.position?.z || 0);
    const dist2D = Math.hypot(dx, dy);
    const dist3D = Math.hypot(dx, dy, dz);

    const radiusRef = Math.max(refObj.scale?.x || 0.41, refObj.scale?.y || 0.41) / 2;
    const radiusTarget = Math.max(curObj.scale?.x || 0.41, curObj.scale?.y || 0.41) / 2;
    const edgeGap = Math.max(0, dist2D - radiusRef - radiusTarget);

    if (gapInput) {
      gapInput.value = edgeGap.toFixed(2);
    }

    const modeSelect = panel?.querySelector('[data-role="ref-sync-mode"]');
    if (modeSelect) {
      modeSelect.value = "offset";
      try {
        localStorage.setItem("auto-lwh-ref-mode", "offset");
      } catch (_) {}
    }

    const refYaw = (refObj.rotation && Number.isFinite(refObj.rotation.z)) ? refObj.rotation.z : 0;
    const cosRef = Math.cos(-refYaw);
    const sinRef = Math.sin(-refYaw);
    const localDx = cosRef * dx - sinRef * dy;
    const localDy = sinRef * dx + cosRef * dy;

    const targetTrackName = curObj.userData?.trackName || curObj.userData?.trackId || "B";
    const refTrackName = refObj.userData?.trackName || refId;

    lastConeRelation = {
      benchmarkFrame: curFrameNum,
      refTrackName: String(refTrackName),
      refTrackId: String(refObj.userData?.trackId || ""),
      refYaw: refYaw,
      targetTrackName: String(targetTrackName),
      targetTrackId: String(curObj.userData?.trackId || ""),
      classType: curObj.userData?.classType || "traffic_cone",
      classId: curObj.userData?.classId || "",
      scale: {
        x: curObj.scale?.x || 0.41,
        y: curObj.scale?.y || 0.41,
        z: curObj.scale?.z || 0.41,
      },
      rotation: {
        x: curObj.rotation?.x || 0,
        y: curObj.rotation?.y || 0,
        z: curObj.rotation?.z || 0,
        order: curObj.rotation?.order || "XYZ",
      },
      mode: "offset",
      gap: Number(edgeGap.toFixed(3)),
      deltaX: Number(dx.toFixed(3)),
      deltaY: Number(dy.toFixed(3)),
      deltaZ: Number(dz.toFixed(3)),
      localDx: Number(localDx.toFixed(3)),
      localDy: Number(localDy.toFixed(3)),
      dist2D: Number(dist2D.toFixed(3)),
      dist3D: Number(dist3D.toFixed(3)),
      unitX: dist2D > 1e-4 ? dx / dist2D : 1,
      unitY: dist2D > 1e-4 ? dy / dist2D : 0,
      timestamp: Date.now(),
    };

    localStorage.setItem("auto-lwh-cone-relation", JSON.stringify(lastConeRelation));

    // Không tự động bật checkbox khi chốt chuẩn: Giá trị luôn là false trừ khi người dùng tự tay tích chọn

    if (badge) {
      badge.textContent = `⭐ Chuẩn F${curFrameNum}: ${dist2D.toFixed(2)}m`;
      badge.style.background = "#065f46";
      badge.style.color = "#a7f3d0";
    }

    const benchmarkBanner = panel?.querySelector('[data-role="ref-benchmark-status"]');
    if (benchmarkBanner) {
      benchmarkBanner.style.display = "block";
      const dXStr = `${dx >= 0 ? '+' : ''}${dx.toFixed(2)}m`;
      const dYStr = `${dy >= 0 ? '+' : ''}${dy.toFixed(2)}m`;
      const dZStr = `${dz >= 0 ? '+' : ''}${dz.toFixed(2)}m`;
      benchmarkBanner.innerHTML = `⭐ <b>Đã chốt chuẩn F${curFrameNum}:</b> #${refTrackName} ➜ #${targetTrackName} | Cự ly: <b>${dist2D.toFixed(2)}m</b> (Hở: ${edgeGap.toFixed(2)}m)<br/><span style="color:#cbd5e1;font-size:8.5px;">ΔX: ${dXStr} | ΔY: ${dYStr} | ΔZ: ${dZStr}</span><br/><span style="color:#6ee7b7;font-size:8.5px;font-weight:600;">✓ Sang frame mới: Bấm <b>Alt+B</b> để dời Cone B (hoặc tự tích 'Tự dời B khi qua Frame')</span>`;
    }

    const fromInput = panel?.querySelector('[data-role="batch-from-frame"]');
    const toInput = panel?.querySelector('[data-role="batch-to-frame"]');
    const editor = window.editor || window.__APP__?.editor || window.app?.editor;
    const totalF = Array.isArray(editor?.state?.frames) ? editor.state.frames.length : null;
    if (fromInput) {
      fromInput.value = String(curFrameNum + 1 <= (totalF || 9999) ? curFrameNum + 1 : curFrameNum);
    }
    if (toInput && totalF) {
      toInput.value = String(totalF);
    }

    updatePositionPanel();
    return lastConeRelation;
  }

  function spawnConeB(frameParam) {
    const editor = window.editor || window.__APP__?.editor || window.app?.editor;
    const pc = getPagePc();
    const panel = document.getElementById(POSITION_PANEL_ID);
    const badge = panel?.querySelector('[data-role="ref-z-badge"]');

    const relation = getSavedConeRelation();
    if (!relation || !relation.refTrackName) {
      if (badge && (!frameParam || curFrame === editor?.getCurrentFrame?.())) {
        badge.textContent = "Chưa có chuẩn A-B";
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
      return false;
    }

    const curFrame = frameParam || (editor?.getCurrentFrame ? editor.getCurrentFrame() : null);
    if (!curFrame) return false;

    // Lấy danh sách vật thể ở frame mục tiêu
    let frameObjs = [];
    if (editor?.dataManager && typeof editor.dataManager.getFrameObject === "function") {
      frameObjs = editor.dataManager.getFrameObject(curFrame.id) || [];
    }
    if ((!frameObjs || frameObjs.length === 0) && (!frameParam || curFrame === editor?.getCurrentFrame?.())) {
      frameObjs = getAll3DObjects();
    }

    // Tìm Cone A ở frame mục tiêu
    const qRef = String(relation.refTrackName || "").trim().toLowerCase().replace(/^#/, "");
    const qRefId = String(relation.refTrackId || "").trim().toLowerCase();
    const coneA = frameObjs.find((o) => {
      const tn = String(o?.userData?.trackName ?? "").trim().toLowerCase().replace(/^#/, "");
      const tid = String(o?.userData?.trackId ?? "").trim().toLowerCase();
      const id = String(o?.userData?.id ?? o?.id ?? o?.uuid ?? "").trim().toLowerCase();
      return (qRef && (tn === qRef || tid === qRef || id === qRef)) || (qRefId && (tid === qRefId || id === qRefId));
    });

    if (!coneA || !coneA.position) {
      if (badge && (!frameParam || curFrame === editor?.getCurrentFrame?.())) {
        badge.textContent = `Ko thấy Cone A (#${relation.refTrackName})`;
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
      return false;
    }

    // Tọa độ Cone A hiện tại ở frame này
    const refX = Number(coneA.position.x) || 0;
    const refY = Number(coneA.position.y) || 0;
    const refZ = Number(coneA.position.z) || 0;
    const refL = Number(coneA.scale?.x) || relation.scale.x;
    const refW = Number(coneA.scale?.y) || relation.scale.y;

    const targetL = relation.scale.x;
    const targetW = relation.scale.y;

    const refYaw = (coneA.rotation && Number.isFinite(coneA.rotation.z)) ? coneA.rotation.z : 0;
    const cosB = Math.cos(refYaw);
    const sinB = Math.sin(refYaw);

    let newX = refX;
    let newY = refY;
    let newZ = refZ + (relation.deltaZ || 0);

    const mode = relation.mode || "offset";
    const radiusRef = Math.max(refL, refW) / 2;
    const radiusTarget = Math.max(targetL, targetW) / 2;
    const centerDist = (relation.gap !== undefined && relation.gap > 0)
      ? (radiusRef + radiusTarget + relation.gap)
      : (relation.dist2D || (radiusRef + radiusTarget));

    if (mode === "offset") {
      if (Number.isFinite(relation.localDx) && Number.isFinite(relation.localDy) && Number.isFinite(relation.refYaw)) {
        const dYaw = refYaw - (relation.refYaw || 0);
        const cosD = Math.cos(dYaw);
        const sinD = Math.sin(dYaw);
        newX = refX + (relation.deltaX * cosD - relation.deltaY * sinD);
        newY = refY + (relation.deltaX * sinD + relation.deltaY * cosD);
      } else {
        newX = refX + (relation.deltaX || 0);
        newY = refY + (relation.deltaY || 0);
      }
      newZ = refZ + (relation.deltaZ || 0);
    } else if (mode === "line") {
      const ux = relation.unitX !== undefined ? relation.unitX : 1;
      const uy = relation.unitY !== undefined ? relation.unitY : 0;
      newX = refX + centerDist * ux;
      newY = refY + centerDist * uy;
      newZ = refZ + (relation.deltaZ || 0);
    } else if (mode === "front") {
      newX = refX + centerDist * cosB;
      newY = refY + centerDist * sinB;
      newZ = refZ + (relation.deltaZ || 0);
    } else if (mode === "behind") {
      newX = refX - centerDist * cosB;
      newY = refY - centerDist * sinB;
      newZ = refZ + (relation.deltaZ || 0);
    } else if (mode === "left") {
      newX = refX - centerDist * sinB;
      newY = refY + centerDist * cosB;
      newZ = refZ + (relation.deltaZ || 0);
    } else if (mode === "right") {
      newX = refX + centerDist * sinB;
      newY = refY - centerDist * cosB;
      newZ = refZ + (relation.deltaZ || 0);
    } else if (mode === "axis_x") {
      const dirX = (relation.deltaX || 0) >= 0 ? 1 : -1;
      newX = refX + dirX * centerDist;
      newY = refY;
      newZ = refZ + (relation.deltaZ || 0);
    } else if (mode === "axis_y") {
      const dirY = (relation.deltaY || 0) >= 0 ? 1 : -1;
      newX = refX;
      newY = refY + dirY * centerDist;
      newZ = refZ + (relation.deltaZ || 0);
    } else {
      newX = refX + (relation.deltaX || 0);
      newY = refY + (relation.deltaY || 0);
      newZ = refZ + (relation.deltaZ || 0);
    }

    newX = Number(newX.toFixed(3));
    newY = Number(newY.toFixed(3));
    newZ = Number(newZ.toFixed(3));

    // Kiểm tra xem Cone B đã có ở frame này chưa
    const qTarget = String(relation.targetTrackName || "").trim().toLowerCase().replace(/^#/, "");
    const qTargetId = String(relation.targetTrackId || "").trim().toLowerCase();

    // 1. Nếu đang ở frame hiện tại và user đang chọn 1 box (khác Cone A) -> đó chính là Cone B cần chỉnh vị trí
    let targetConeB = null;
    if (!frameParam || curFrame === editor?.getCurrentFrame?.()) {
      const selectedObj = getSelectedObject();
      if (selectedObj && selectedObj !== coneA && selectedObj.uuid !== coneA.uuid && selectedObj.position) {
        targetConeB = selectedObj;
      }
    }

    // 2. Tìm theo TrackName / TrackId / ID trong danh sách vật thể của frame
    if (!targetConeB) {
      targetConeB = frameObjs.find((o) => {
        if (o === coneA || (o.uuid && coneA.uuid && o.uuid === coneA.uuid)) return false;
        const tn = String(o?.userData?.trackName ?? "").trim().toLowerCase().replace(/^#/, "");
        const tid = String(o?.userData?.trackId ?? "").trim().toLowerCase();
        const id = String(o?.userData?.id ?? o?.id ?? o?.uuid ?? "").trim().toLowerCase();
        return (qTarget && (tn === qTarget || tid === qTarget || id === qTarget)) || (qTargetId && (tid === qTargetId || id === qTargetId));
      });
    }

    if (targetConeB) {
      // CHỈ CHỈNH SỬA POSITION (X, Y, Z), TUYỆT ĐỐI KHÔNG TẠO MỚI HAY THAY ĐỔI GÓC XOAY/KÍCH THƯỚC
      applyObjectTransform(targetConeB, { position: { x: newX, y: newY, z: newZ } });
      if (!frameParam || curFrame === editor?.getCurrentFrame?.()) {
        const autoSnapGround = panel?.querySelector('[data-role="auto-snap-ground"]')?.checked;
        if (autoSnapGround) snapObjectToGround(targetConeB);
        // KHÔNG gọi pc.selectObject(targetConeB) để tránh cướp vùng chọn của người dùng,
        // giúp giữ nguyên ID ghim (Cone A) đang chọn trên timeline khi chuyển frame.
      }
      curFrame.needSave = true;
      persistEditorState();
      if (badge && (!frameParam || curFrame === editor?.getCurrentFrame?.())) {
        const bName = targetConeB.userData?.trackName || relation.targetTrackName || "";
        badge.textContent = `🟢 Dời Cone B (#${bName})`;
        badge.style.background = "#14532d";
        badge.style.color = "#86efac";
      }
      return true;
    }

    // KHÔNG TỰ TẠO MỚI: User sẽ tự tạo đối tượng, tool CHỈ CHỈNH SỬA POSITION
    if (badge && (!frameParam || curFrame === editor?.getCurrentFrame?.())) {
      badge.textContent = `Chưa có Cone B (#${relation.targetTrackName})`;
      badge.style.background = "#713f12";
      badge.style.color = "#fde047";
    }
    return false;
  }

  let isBatchSyncRunning = false;

  async function batchSyncConeB() {
    if (isBatchSyncRunning) return;
    const editor = window.editor || window.__APP__?.editor || window.app?.editor;
    const panel = document.getElementById(POSITION_PANEL_ID);
    const badge = panel?.querySelector('[data-role="ref-z-badge"]');
    if (!editor || !editor.state || !Array.isArray(editor.state.frames)) {
      alert("Không tìm thấy dữ liệu frames của editor.");
      return;
    }

    const relation = getSavedConeRelation();
    if (!relation || !relation.refTrackName) {
      alert("Vui lòng chốt chuẩn A-B ở frame làm chuẩn trước (bấm nút '⭐ Chốt Chuẩn A-B').");
      return;
    }

    const totalF = editor.state.frames.length;
    const curF = (editor.state.frameIndex || 0) + 1;
    const benchF = relation.benchmarkFrame || 1;

    const fromInput = panel?.querySelector('[data-role="batch-from-frame"]');
    const toInput = panel?.querySelector('[data-role="batch-to-frame"]');

    let fromNum = parseInt(fromInput?.value, 10);
    let toNum = parseInt(toInput?.value, 10);

    if (!Number.isFinite(fromNum)) {
      fromNum = curF;
      if (fromInput) fromInput.value = String(fromNum);
    }
    if (!Number.isFinite(toNum)) {
      toNum = totalF;
      if (toInput) toInput.value = String(toNum);
    }

    if (fromNum < 1 || toNum > totalF || fromNum > toNum) {
      alert(`Khoảng frame không hợp lệ: Từ ${fromNum} đến ${toNum} (Tổng dataset có ${totalF} frame)`);
      return;
    }

    const originalFrameIndex = editor.state.frameIndex;
    isBatchSyncRunning = true;

    const batchBtn = panel?.querySelector('[data-role="batch-sync-cone-btn"]');
    if (batchBtn) {
      batchBtn.disabled = true;
      batchBtn.style.opacity = "0.6";
      batchBtn.textContent = "⏳ Đang chạy...";
    }

    let count = 0;
    try {
      for (let f = fromNum - 1; f < toNum; f++) {
        const frameNum = f + 1;
        if (badge) {
          badge.textContent = `⏳ F${frameNum} (${frameNum - fromNum + 1}/${toNum - fromNum + 1})`;
          badge.style.background = "#312e81";
          badge.style.color = "#c7d2fe";
        }

        // 1. Chuyển frame và nạp toàn bộ point cloud + annotation của frame f
        if (editor.state.frameIndex !== f) {
          if (typeof editor.loadFrame === "function") {
            await editor.loadFrame(f, false, true);
          }
        }

        // Chờ 60ms cho Three.js và dữ liệu frame f sẵn sàng
        await new Promise((r) => setTimeout(r, 60));

        // 2. Dời vị trí Cone B ở frame f theo khoảng cách chuẩn
        const ok = spawnConeB();
        if (ok) {
          count++;
          const frameObj = editor.state?.frames?.[f];
          if (frameObj) frameObj.needSave = true;
        }
      }

      // Quay lại frame ban đầu (nếu khác frame hiện tại)
      if (typeof editor.loadFrame === "function" && editor.state.frameIndex !== originalFrameIndex) {
        await editor.loadFrame(originalFrameIndex, false, true);
      }

      const curFrame = editor.getCurrentFrame?.();
      if (curFrame) curFrame.needSave = true;

      if (badge) {
        badge.textContent = `🟢 Đã dời ${count} frame`;
        badge.style.background = "#14532d";
        badge.style.color = "#86efac";
      }

      const benchmarkBanner = panel?.querySelector('[data-role="ref-benchmark-status"]');
      if (benchmarkBanner) {
        benchmarkBanner.style.display = "block";
        benchmarkBanner.innerHTML = `⭐ <b>Chuẩn F${benchF}:</b> #${relation.refTrackName} ➜ #${relation.targetTrackName}<br/><span style="color:#86efac;font-size:9px;font-weight:700;">✓ Đã đồng bộ dời vị trí ${count} frame (F${fromNum} ➜ F${toNum})!<br/>(Vui lòng bấm nút Save trên giao diện để lưu)</span>`;
      }
    } catch (err) {
      console.error("Lỗi khi chạy Chuỗi F:", err);
      if (badge) {
        badge.textContent = "Lỗi chuỗi F";
        badge.style.background = "#7f1d1d";
        badge.style.color = "#fca5a5";
      }
    } finally {
      isBatchSyncRunning = false;
      if (batchBtn) {
        batchBtn.disabled = false;
        batchBtn.style.opacity = "1";
        batchBtn.textContent = "🚀 Đồng bộ";
      }
    }
  }


  function applySelectedYaw() {
    const obj = getSelectedObject();
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!obj || !obj.rotation || !panel) return false;

    const yawDeg = Number(panel.querySelector('[data-role="yaw"]')?.value);
    if (!Number.isFinite(yawDeg)) return false;

    const yawRad = yawDeg * (Math.PI / 180);
    if (!Number.isFinite(yawRad)) return false;
    try {
      const newRotation = obj.rotation.clone();
      newRotation.z = yawRad;
      applyObjectTransform(obj, { rotation: newRotation });
      const pc = getPagePc();
      if (pc && typeof pc.selectObject === "function") pc.selectObject(obj);
      requestAnimationFrame(() => updatePositionPanel());
      return true;
    } catch (error) {
      return false;
    }
  }

  function ensurePositionPanel() {
    let panel = document.getElementById(POSITION_PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = POSITION_PANEL_ID;
    panel.style.position = "fixed";
    panel.style.left = "14px";
    panel.style.top = "14px";
    panel.style.zIndex = "999999";
    panel.style.width = "275px";
    panel.style.maxHeight = "calc(100vh - 28px)";
    panel.style.overflowY = "auto";
    panel.style.overflowX = "hidden";
    panel.style.padding = "8px 9px";
    panel.style.borderRadius = "8px";
    panel.style.background = "#141820";
    panel.style.border = "1px solid #283548";
    panel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.5)";
    panel.style.color = "#f1f5f9";
    panel.style.fontFamily = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
    panel.style.fontSize = "11px";
    panel.style.fontWeight = "500";
    panel.style.lineHeight = "1.35";
    panel.style.boxSizing = "border-box";
    panel.style.userSelect = "none";

    panel.innerHTML = `
      <style>
        #${POSITION_PANEL_ID} {
          scrollbar-width: thin;
          scrollbar-color: #3b4252 rgba(0, 0, 0, 0.2);
        }
        #${POSITION_PANEL_ID}::-webkit-scrollbar {
          width: 4px;
        }
        #${POSITION_PANEL_ID}::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.15);
        }
        #${POSITION_PANEL_ID}::-webkit-scrollbar-thumb {
          background: #3b4252;
          border-radius: 4px;
        }
        #${POSITION_PANEL_ID} input[type="number"],
        #${POSITION_PANEL_ID} input[type="text"],
        #${POSITION_PANEL_ID} select {
          outline: none;
          font-family: inherit;
          font-size: 11px;
          font-weight: 600;
          box-sizing: border-box;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        #${POSITION_PANEL_ID} input[type="number"]:focus,
        #${POSITION_PANEL_ID} input[type="text"]:focus,
        #${POSITION_PANEL_ID} select:focus {
          border-color: #38bdf8 !important;
          background: #1e293b !important;
        }
        #${POSITION_PANEL_ID} input[type="checkbox"] {
          appearance: none;
          width: 12px;
          height: 12px;
          margin: 0;
          border: 1px solid #475569;
          border-radius: 3px;
          background: #0f172a;
          cursor: pointer;
          flex: 0 0 12px;
          display: grid;
          place-content: center;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        #${POSITION_PANEL_ID} input[type="checkbox"]::before {
          content: "";
          width: 5px;
          height: 3px;
          border-left: 2px solid white;
          border-bottom: 2px solid white;
          transform: rotate(-45deg) scale(0);
          transition: transform 0.12s ease;
        }
        #${POSITION_PANEL_ID} input[type="checkbox"]:checked {
          border-color: #38bdf8;
          background: #0284c7;
        }
        #${POSITION_PANEL_ID} input[type="checkbox"]:checked::before {
          transform: rotate(-45deg) scale(1);
        }
        #${POSITION_PANEL_ID} button {
          font-family: inherit;
          font-weight: 700;
          transition: filter 0.15s ease, transform 0.08s ease;
          box-sizing: border-box;
        }
        #${POSITION_PANEL_ID} button:hover {
          filter: brightness(1.12);
        }
        #${POSITION_PANEL_ID} button:active {
          transform: scale(0.98);
        }
        #${POSITION_PANEL_ID} [data-role="tab-button"] {
          flex: 1;
          height: 23px;
          border: 1px solid #334155;
          border-radius: 4px;
          background: #1e293b;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }
        #${POSITION_PANEL_ID} [data-role="tab-button"][data-active="true"] {
          border-color: #0284c7;
          background: #0369a1;
          color: #ffffff;
        }
        #${POSITION_PANEL_ID} [data-role="auto-fit-pane"] {
          min-height: 100px;
        }
        #${POSITION_PANEL_ID} [data-role="keyframe-card"] {
          padding: 5px 6px;
          border: 1px solid #334155;
          border-radius: 6px;
          background: #151d2a;
        }
        #${POSITION_PANEL_ID} [data-role="keyframe-card"] input[readonly] {
          height: 24px;
          text-align: center;
          font-size: 11px;
        }
        #${POSITION_PANEL_ID} details summary::-webkit-details-marker {
          display: none;
        }
        #${POSITION_PANEL_ID} details summary {
          list-style: none;
        }
        #${POSITION_PANEL_ID} details[open] summary .toggle-arrow {
          transform: rotate(180deg);
        }
      </style>

      <!-- HEADER -->
      <div data-role="drag-header" style="display:flex;align-items:center;justify-content:space-between;cursor:move;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #283548;">
        <div style="display:flex;align-items:center;gap:5px;min-width:0;flex:1;">
          <span style="font-weight:700;font-size:11px;color:#f1f5f9;flex:0 0 auto;">🕹️ HUD</span>
          <span data-role="class-name" style="padding:1px 6px;border-radius:3px;background:#1e293b;border:1px solid #334155;color:#38bdf8;font-size:9.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">No selection</span>
        </div>
        <button data-role="panel-collapse" title="Thu nhỏ panel" style="width:18px;height:18px;padding:0;border:none;border-radius:3px;background:#334155;color:#cbd5e1;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;">−</button>
      </div>

      <div data-role="panel-content">
        <!-- TABS -->
        <div style="display:flex;gap:3px;margin-bottom:6px;">
          <button data-role="tab-button" data-tab="transform" data-active="true" style="flex:1;padding:0 2px;font-size:9.5px;">Transform</button>
          <button data-role="tab-button" data-tab="auto-fit" data-active="false" style="flex:1;padding:0 2px;font-size:9.5px;">Auto Fit</button>
        </div>

        <div data-role="transform-pane">
          <!-- Lưới 2x2 cho X, Y, Z, Yaw tiết kiệm không gian -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:#dbe4ff;">
              <span style="width:14px;font-weight:600;color:#93c5fd;">X</span>
              <input data-role="x" type="number" step="0.01" style="flex:1;width:100%;padding:3px 5px;border-radius:4px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
            </div>
            <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:#dbe4ff;">
              <span style="width:14px;font-weight:600;color:#93c5fd;">Y</span>
              <input data-role="y" type="number" step="0.01" style="flex:1;width:100%;padding:3px 5px;border-radius:4px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
            </div>
            <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:#dbe4ff;">
              <span style="width:14px;font-weight:600;color:#93c5fd;">Z</span>
              <input data-role="z" type="number" step="0.01" style="flex:1;width:100%;padding:3px 5px;border-radius:4px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
            </div>
            <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:#dbe4ff;">
              <span style="width:24px;font-weight:600;color:#a78bfa;">Yaw</span>
              <input data-role="yaw" type="number" step="0.1" style="flex:1;width:100%;padding:3px 5px;border-radius:4px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
            </div>
          </div>
          <!-- Hàng ngang cho L, W, H -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:#dbe4ff;">
              <span style="font-weight:600;color:#34d399;">L</span>
              <input data-role="l" type="number" step="0.01" style="flex:1;width:100%;padding:3px 5px;border-radius:4px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
            </div>
            <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:#dbe4ff;">
              <span style="font-weight:600;color:#34d399;">W</span>
              <input data-role="w" type="number" step="0.01" style="flex:1;width:100%;padding:3px 5px;border-radius:4px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
            </div>
            <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:#dbe4ff;">
              <span style="font-weight:600;color:#34d399;">H</span>
              <input data-role="h" type="number" step="0.01" style="flex:1;width:100%;padding:3px 5px;border-radius:4px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
            </div>
          </div>

          <!-- GỢI Ý PHÍM TẮT NUMPAD POSITION -->
          <div style="margin-bottom:6px;padding:4px 6px;border-radius:4px;background:#0f172a;border:1px solid #1e293b;font-size:8.5px;color:#94a3b8;line-height:1.4;">
            <div style="display:flex;justify-content:space-between;align-items:center;color:#60a5fa;font-weight:700;margin-bottom:2px;">
              <span>⌨️ Numpad Nudge (±0.01m):</span>
              <span style="color:#a78bfa;">Yaw ±0.5°</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:#cbd5e1;">
              <span>8/2: Tiến/Lùi (±Y)</span>
              <span>4/6: Trái/Phải (±X)</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:#cbd5e1;">
              <span>9/3: Lên/Xuống (±Z)</span>
              <span>7/1: Xoay Trái/Phải</span>
            </div>
          </div>

          <!-- CĂN XE & MẶT ĐƯỜNG (COLLAPSIBLE) -->
          <details data-role="overhead-alignment-card" style="margin-bottom:6px;border:1px solid #283548;border-radius:6px;background:#1a2232;">
            <summary style="padding:4px 7px;font-weight:700;font-size:10px;color:#38bdf8;cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;">
              <span>🎯 CĂN XE & MẶT ĐƯỜNG</span>
              <div style="display:flex;gap:3px;align-items:center;">
                <span data-role="overhead-fit-badge" style="font-size:8.5px;font-weight:600;padding:1px 4px;border-radius:3px;background:#263447;color:#94a3b8;max-width:65px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;" title="Trạng thái sườn/đuôi">Sườn: --</span>
                <span data-role="ground-diff-badge" style="font-size:8.5px;font-weight:600;padding:1px 4px;border-radius:3px;background:#263447;color:#94a3b8;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;" title="Trạng thái mặt đường">Đáy: --</span>
                <span class="toggle-arrow" style="font-size:8px;color:#64748b;margin-left:2px;display:inline-block;transition:transform 0.15s ease;">▼</span>
              </div>
            </summary>
            <div style="padding:6px 7px;border-top:1px solid #283548;">
              <div style="display:flex;gap:4px;margin-bottom:5px;">
                <button data-role="snap-overhead-btn" title="Hút khít sườn và đuôi xe (Alt+O)" style="flex:1;min-width:0;height:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:none;border-radius:4px;background:#0d9488;color:white;cursor:pointer;padding:0;">
                  <span style="font-size:10px;font-weight:700;line-height:1.2;">🎯 Sườn</span>
                  <span style="font-size:8.5px;opacity:0.8;font-weight:500;line-height:1;">Alt+O</span>
                </button>
                <button data-role="snap-ground-btn" title="Hạ đáy tiếp xúc mặt đường (Alt+G)" style="flex:1;min-width:0;height:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:none;border-radius:4px;background:#0284c7;color:white;cursor:pointer;padding:0;">
                  <span style="font-size:10px;font-weight:700;line-height:1.2;">⬇️ Hạ Đáy</span>
                  <span style="font-size:8.5px;opacity:0.8;font-weight:500;line-height:1;">Alt+G</span>
                </button>
                <button data-role="snap-all-btn" title="Căn chỉnh toàn diện: Sườn/đuôi + Hạ đáy (Alt+F)" style="flex:1;min-width:0;height:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:none;border-radius:4px;background:#6366f1;color:white;cursor:pointer;padding:0;">
                  <span style="font-size:10px;font-weight:700;line-height:1.2;">⚡ All</span>
                  <span style="font-size:8.5px;opacity:0.8;font-weight:500;line-height:1;">Alt+F</span>
                </button>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;font-size:10px;color:#94a3b8;">
                <span>Bù đáy:</span>
                <div style="display:flex;align-items:center;gap:3px;">
                  <button data-role="offset-preset" data-offset="-0.05" style="width:22px;height:19px;padding:0;border:1px solid #334155;border-radius:3px;background:#1e293b;color:#cbd5e1;font-size:9px;font-weight:700;cursor:pointer;">-5</button>
                  <button data-role="offset-preset" data-offset="0" style="width:20px;height:19px;padding:0;border:1px solid #334155;border-radius:3px;background:#1e293b;color:#cbd5e1;font-size:9px;font-weight:700;cursor:pointer;">0</button>
                  <button data-role="offset-preset" data-offset="0.05" style="width:22px;height:19px;padding:0;border:1px solid #334155;border-radius:3px;background:#1e293b;color:#cbd5e1;font-size:9px;font-weight:700;cursor:pointer;">+5</button>
                  <input data-role="ground-offset-input" type="number" step="0.01" value="0.00" style="width:38px;height:19px;padding:0 2px;border:1px solid #334155;border-radius:3px;background:#0f172a;color:white;text-align:center;font-size:10px;font-weight:700;" />
                  <span style="font-size:9px;">m</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#94a3b8;">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="Tự động bám mặt đường khi chuyển frame">
                  <input data-role="auto-snap-ground" type="checkbox" />
                  <span>Tự bám đường</span>
                </label>
                <select data-role="box-pivot-mode" style="height:20px;padding:0 3px;border:1px solid #334155;border-radius:3px;background:#0f172a;color:#cbd5e1;font-size:9px;font-weight:600;cursor:pointer;outline:none;">
                  <option value="auto">⚡ Neo Z Tự động</option>
                  <option value="center">Tâm khối hộp</option>
                  <option value="bottom">Tâm mặt đáy</option>
                </select>
              </div>
            </div>
          </details>

          <!-- ĐỒNG BỘ THEO ID & THƯỚC ĐO KHOẢNG CÁCH CARD -->
          <div data-role="ref-z-alignment-card" style="margin-bottom:6px;padding:6px 7px;border:1px solid #283548;border-radius:6px;background:#1a2232;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
              <span style="font-weight:700;font-size:10px;color:#a78bfa;text-transform:uppercase;letter-spacing:0.3px;">📐 Đồng Bộ & Đo Cự Ly</span>
              <span data-role="ref-z-badge" style="font-size:8.5px;font-weight:600;padding:1px 4px;border-radius:3px;background:#263447;color:#94a3b8;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Sẵn sàng</span>
            </div>
            <!-- Banner thông tin Chuẩn Benchmark đã chốt -->
            <div data-role="ref-benchmark-status" style="display:none;margin-bottom:5px;padding:4px 6px;border-radius:4px;background:#064e3b;border:1px solid #059669;color:#a7f3d0;font-size:9px;line-height:1.4;">
            </div>
            <!-- Hàng 1: ID, Ghim ID, Chọn Hướng Vị Trí, Độ Hở (Gap) -->
            <div style="display:flex;gap:4px;align-items:center;margin-bottom:5px;">
              <span style="font-size:9.5px;color:#94a3b8;flex:0 0 auto;">ID:</span>
              <input data-role="ref-id-input" type="text" placeholder="1" style="width:32px;flex:0 0 32px;height:22px;text-align:center;padding:0 2px;border:1px solid #4338ca;border-radius:4px;background:#0f172a;color:#e0e7ff;font-size:10px;font-weight:700;" title="Nhập ID box tham chiếu (Cone A)" />
              <button data-role="ref-pick-id-btn" title="Ghim ID của box đang chọn làm tham chiếu (Cone A)" style="width:20px;flex:0 0 20px;height:22px;border:1px solid #4f46e5;border-radius:4px;background:#312e81;color:#c7d2fe;cursor:pointer;font-size:10px;padding:0;display:flex;align-items:center;justify-content:center;">📌</button>
              <select data-role="ref-sync-mode" style="flex:1;min-width:0;height:22px;padding:0 2px;border:1px solid #3d4755;border-radius:4px;background:#0f172a;color:#cbd5e1;font-size:9.5px;font-weight:600;outline:none;cursor:pointer;" title="Chọn vị trí đặt so với ID tham chiếu">
                <option value="offset">🎯 Giữ cự ly chuẩn (ΔX, ΔY)</option>
                <option value="line">➡️ Nối thẳng A → B</option>
                <option value="front">▲ Trước mặt (+L)</option>
                <option value="behind">▼ Sau lưng (-L)</option>
                <option value="left">◀️ Bên Trái (+W)</option>
                <option value="right">▶️ Bên Phải (-W)</option>
                <option value="axis_x">↔️ Trục X (+X/-X)</option>
                <option value="axis_y">↕️ Trục Y (+Y/-Y)</option>
                <option value="ground">📏 Cùng độ cao (XYZ)</option>
                <option value="top">⚡ Trên đỉnh (+H)</option>
                <option value="bottom">🕳️ Dưới đáy (-H)</option>
              </select>
              <span style="font-size:9.5px;color:#94a3b8;flex:0 0 auto;" title="Độ hở giữa 2 đối tượng">Hở:</span>
              <input data-role="ref-gap-input" type="number" step="0.01" value="0.00" style="width:40px;flex:0 0 40px;height:22px;padding:0 2px;text-align:center;border:1px solid #3d4755;border-radius:4px;background:#0f172a;color:white;font-size:10px;font-weight:700;" title="Độ hở/khoảng cách (m) cho hướng đang chọn" />
              <span style="font-size:8.5px;color:#64748b;flex:0 0 auto;">m</span>
            </div>
            <!-- Strip hiển thị khoảng cách Realtime giữa Cone B và Cone A -->
            <div data-role="ref-distance-info" style="display:none;margin-bottom:5px;padding:3px 6px;border-radius:4px;background:#0b1329;border:1px solid #1e293b;font-size:9px;line-height:1.4;">
              <div style="display:flex;justify-content:space-between;align-items:center;color:#a5b4fc;font-weight:700;">
                <span data-role="ref-dist-title">📏 Tới #--:</span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <span data-role="ref-dist-2d" style="color:#38bdf8;">2D: --m</span>
                  <button data-role="quick-lock-btn" title="Chốt cự ly đo được này làm chuẩn" style="height:17px;padding:0 5px;border:none;border-radius:3px;background:#7c3aed;color:white;font-size:8.5px;font-weight:700;cursor:pointer;">⭐ Chốt</button>
                </div>
              </div>
              <div data-role="ref-dist-details" style="display:flex;justify-content:space-between;color:#94a3b8;font-size:8.5px;margin-top:1px;">
                <span>ΔX: --m | ΔY: --m | ΔZ: --m</span>
                <span data-role="ref-dist-gap" style="color:#fde047;font-weight:600;">Hở: --m</span>
              </div>
            </div>
            <!-- Nút Chốt Chuẩn A-B to rõ ràng -->
            <div style="margin-bottom:5px;">
              <button data-role="lock-benchmark-btn" title="Lưu cự ly & vị trí giữa Cone A và Cone B ở frame này làm chuẩn để sinh Cone B cho các frame sau" style="width:100%;height:25px;border:none;border-radius:4px;background:#7c3aed;color:white;cursor:pointer;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;">
                ⭐ Chốt Chuẩn A-B (Lấy Frame Này)
              </button>
            </div>
            <!-- Hàng 2: Nút Căn Vị Trí, Nút Sinh Cone B, và Checkbox Tự Khóa -->
            <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">
              <button data-role="apply-ref-z-btn" title="Căn chỉnh vị trí theo ID tham chiếu theo hướng và độ hở đã chọn (Phím tắt: Alt+Z)" style="flex:1;min-width:0;height:23px;border:none;border-radius:4px;background:#6366f1;color:white;cursor:pointer;font-size:9.5px;font-weight:700;padding:0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                📐 Căn Vị Trí
              </button>
              <button data-role="spawn-cone-b-btn" title="Căn chỉnh / dời vị trí Cone B theo cự ly chuẩn từ Cone A (Phím tắt: Alt+B)" style="flex:1;min-width:0;height:23px;border:none;border-radius:4px;background:#059669;color:white;cursor:pointer;font-size:9.5px;font-weight:700;padding:0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ⚡ Dời Cone B (Alt+B)
              </button>
              <label style="display:flex;align-items:center;gap:2px;font-size:9px;color:#cbd5e1;cursor:pointer;flex:0 0 auto;" title="Hễ vẽ một box mới thì box đó sẽ tự động hút theo ID và hướng đã chọn">
                <input data-role="auto-ref-z-checkbox" type="checkbox" style="cursor:pointer;" />
                <span>Tự khóa</span>
              </label>
            </div>
            <!-- Hàng 3: Tự dời vị trí khi đổi frame -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding-top:4px;border-top:1px dashed #334155;font-size:9px;color:#cbd5e1;margin-bottom:4px;">
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="Khi chuyển sang frame mới, nếu có Cone B thì tự động chỉnh lại vị trí theo khoảng cách tới Cone A">
                <input data-role="auto-spawn-cone" type="checkbox" />
                <span style="color:#6ee7b7;font-weight:600;">Tự dời B khi qua Frame</span>
              </label>
            </div>
            <!-- Hàng 4: Ô INPUT ĐỒNG BỘ CHUỖI FRAME TRỰC TIẾP -->
            <div style="display:flex;align-items:center;gap:3px;padding-top:4px;border-top:1px dashed #334155;font-size:9px;color:#cbd5e1;">
              <span style="font-weight:700;color:#6ee7b7;flex:0 0 auto;" title="Đồng bộ chuỗi Frame liên tục">Chuỗi F:</span>
              <input data-role="batch-from-frame" type="number" min="1" step="1" placeholder="Từ" style="width:36px;flex:0 0 36px;height:21px;text-align:center;padding:0 1px;border:1px solid #3d4755;border-radius:3px;background:#0f172a;color:#e0e7ff;font-size:9.5px;font-weight:700;" title="Frame bắt đầu" />
              <span style="color:#64748b;font-size:8.5px;">➜</span>
              <input data-role="batch-to-frame" type="number" min="1" step="1" placeholder="Đến" style="width:36px;flex:0 0 36px;height:21px;text-align:center;padding:0 1px;border:1px solid #3d4755;border-radius:3px;background:#0f172a;color:#e0e7ff;font-size:9.5px;font-weight:700;" title="Frame kết thúc" />
              <button data-role="batch-sync-cone-btn" title="Chạy đồng bộ sinh Cone B từ Frame ... đến Frame ..." style="flex:1;min-width:0;height:21px;padding:0 4px;border:1px solid #059669;border-radius:3px;background:#065f46;color:#a7f3d0;font-size:9.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                🚀 Đồng bộ
              </button>
            </div>
          </div>

          <!-- TÙY CHỌN 2D & SIZE MẪU CARD -->
          <div style="margin-bottom:6px;padding:6px 7px;border:1px solid #283548;border-radius:6px;background:#1a2232;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:5px;font-size:10px;color:#cbd5e1;">
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="Đồng bộ Width và Height">
                <input data-role="sync-wh" type="checkbox" />
                <span>Đồng bộ W=H</span>
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="Đồng bộ Length và Width">
                <input data-role="sync-lw" type="checkbox" />
                <span>Đồng bộ L=W</span>
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="Khóa Zoom 3 khung nhìn Side Views">
                <input data-role="lock-side-zoom" type="checkbox" />
                <span style="color:#93c5fd;">Khóa Zoom 2D</span>
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="Khóa Xoay 3 khung nhìn Side Views">
                <input data-role="lock-side-rotation" type="checkbox" />
                <span style="color:#c4b5fd;">Khóa Xoay 2D</span>
              </label>
            </div>
            <div style="display:flex;align-items:center;gap:4px;border-top:1px solid #283548;padding-top:4px;">
              <button data-role="signal" style="flex:1;height:22px;border:none;border-radius:3px;background:#ef4444;color:white;cursor:pointer;font-size:9.5px;font-weight:700;">Biển báo</button>
              <button data-role="cone" style="flex:1;height:22px;border:none;border-radius:3px;background:#a855f7;color:white;cursor:pointer;font-size:9.5px;font-weight:700;">Cone</button>
            </div>
          </div>

          <!-- MỐC GHIM 2D & BÓNG MA 3D (CHỐNG LỆCH & SOI LẮC LIDAR) -->
          <div data-role="landmark-ghost-card" style="margin-bottom:6px;padding:6px 7px;border:1px solid #283548;border-radius:6px;background:#1a2232;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
              <span style="font-weight:700;font-size:10px;color:#38bdf8;text-transform:uppercase;letter-spacing:0.3px;">🎯 Mốc Ghim & Bóng Ma</span>
              <span data-role="ghost-status-badge" style="font-size:8.5px;font-weight:600;padding:1px 4px;border-radius:3px;background:#263447;color:#94a3b8;max-width:85px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Chờ đối tượng</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:5px;font-size:9.5px;color:#cbd5e1;">
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="Bật tâm ngắm mốc ghim cố định trên 3 khung nhìn 2D (Alt+M). Kéo thả tâm ngắm vào mốc gương xe để soi lắc lidar khi chuyển frame.">
                <input data-role="enable-crosshair-pin" type="checkbox" />
                <span style="color:#38bdf8;font-weight:600;">🎯 Ghim Mốc (Alt+M)</span>
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="Hiển thị bóng ma khung dây của Frame trước để soi độ lệch quỹ đạo và kích thước (Alt+J).">
                <input data-role="enable-ghost-box" type="checkbox" />
                <span style="color:#f59e0b;font-weight:600;">👻 Bóng Ma (Alt+J)</span>
              </label>
            </div>
            <div style="display:flex;gap:4px;align-items:center;">
              <button data-role="reset-crosshair-btn" title="Đưa tâm ngắm mốc ghim về giữa khung nhìn 2D" style="flex:1;min-width:0;height:22px;border:none;border-radius:3px;background:#0284c7;color:white;cursor:pointer;font-size:9.5px;font-weight:700;padding:0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                🎯 Về Tâm Mốc
              </button>
              <button data-role="lock-ghost-btn" title="Chốt/Khóa box hiện tại làm bóng ma cố định để soi các frame khác (nhấn lại để mở khóa)" style="flex:1;min-width:0;height:22px;border:none;border-radius:3px;background:#d97706;color:white;cursor:pointer;font-size:9.5px;font-weight:700;padding:0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                👻 Chốt Bóng
              </button>
            </div>
          </div>

          <!-- CĂN BIỂN BÁO TRÊN CAO (COLLAPSIBLE) -->
          <details data-role="signboard-alignment-card" style="border:1px solid #283548;border-radius:6px;background:#1a2232;">
            <summary style="padding:4px 7px;font-weight:700;font-size:10px;color:#f59e0b;cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;">
              <span>🪧 CĂN BIỂN BÁO TRÊN CAO</span>
              <div style="display:flex;gap:3px;align-items:center;">
                <span data-role="signboard-fit-badge" style="font-size:8.5px;font-weight:600;padding:1px 4px;border-radius:3px;background:#263447;color:#94a3b8;">Sẵn sàng</span>
                <span class="toggle-arrow" style="font-size:8px;color:#64748b;margin-left:2px;display:inline-block;transition:transform 0.15s ease;">▼</span>
              </div>
            </summary>
            <div style="padding:5px 7px 6px;border-top:1px solid #283548;">
              <button data-role="snap-signboard-btn" title="Căn tâm 3D và ôm khít biển báo (Alt+S)" style="width:100%;height:24px;border:none;border-radius:4px;background:#d97706;color:white;cursor:pointer;font-size:10px;font-weight:700;margin-bottom:4px;">
                🪧 Snap Biển Báo (Alt+S)
              </button>
              <label style="display:flex;align-items:center;gap:5px;font-size:9.5px;color:#fde68a;cursor:pointer;">
                <input data-role="signboard-fit-size" type="checkbox" checked />
                <span>Tự ôm khít kích thước (W, H)</span>
              </label>
            </div>
          </details>
        </div>
      <div data-role="auto-fit-pane" style="display:none;padding:6px;border:1px solid #3b4655;border-radius:6px;background:#171e29;">
        <div style="font-size:11px;font-weight:700;margin-bottom:6px;color:#e5edff;">Nội suy XYZ giữa 2 frame</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:6px;">
          <label style="font-size:9px;color:#dbe4ff;">Frame A
            <input data-role="frame-start-index" type="number" step="1" placeholder="A" style="width:100%;margin-top:2px;padding:3px 4px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#111827;color:white;font-family:inherit;font-size:10px;" />
          </label>
          <label style="font-size:9px;color:#dbe4ff;">Frame N
            <input data-role="frame-current-index" type="number" step="1" placeholder="N" style="width:100%;margin-top:2px;padding:3px 4px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#111827;color:white;font-family:inherit;font-size:10px;" />
          </label>
          <label style="font-size:9px;color:#dbe4ff;">Frame B
            <input data-role="frame-end-index" type="number" step="1" placeholder="B" style="width:100%;margin-top:2px;padding:3px 4px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#111827;color:white;font-family:inherit;font-size:10px;" />
          </label>
        </div>
        <div data-role="keyframe-card" style="display:flex;flex-direction:column;gap:4px;margin-bottom:5px;">
          <div style="display:flex;align-items:center;justify-content:space-between;"><strong style="font-size:10px;color:#93c5fd;">FRAME A</strong><button data-role="copy-frame-a" title="Chốt Frame A" style="height:20px;padding:0 6px;border:none;border-radius:4px;background:#2563eb;color:white;cursor:pointer;font-size:9px;font-weight:700;">Chốt Frame A</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
            <input data-role="frame-a-x" type="number" step="0.01" readonly placeholder="X" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
            <input data-role="frame-a-y" type="number" step="0.01" readonly placeholder="Y" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
            <input data-role="frame-a-z" type="number" step="0.01" readonly placeholder="Z" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:4px;margin-bottom:5px;">
          <label style="font-size:9px;color:#dbe4ff;">Chế độ chuyển động
            <select data-role="frame-interpolation-mode" style="width:100%;margin-top:2px;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#111827;color:white;font-family:inherit;font-size:10px;">
              <option value="linear">Đi đều (Linear)</option>
              <option value="ease-out">🚗🛑 Phanh chậm (Ease-Out)</option>
              <option value="ease-in">🚗💨 Tăng tốc (Ease-In)</option>
              <option value="ease-in-out">〰️ S-Curve (Chuyển nhịp)</option>
              <option value="quadratic">📐 3 điểm A-M-B</option>
            </select>
          </label>
          <label data-role="frame-m-input-wrapper" style="font-size:9px;color:#dbe4ff;transition:opacity 0.2s;">Frame M
            <input data-role="frame-middle-index" type="number" step="1" placeholder="M" style="width:100%;margin-top:2px;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#111827;color:white;font-family:inherit;font-size:10px;" />
          </label>
        </div>
        <div data-role="keyframe-card-m" style="display:flex;flex-direction:column;gap:4px;margin-bottom:5px;padding:5px 6px;border:1px solid #334155;border-radius:6px;background:#151d2a;transition:opacity 0.2s;">
          <div style="display:flex;align-items:center;justify-content:space-between;"><strong style="font-size:10px;color:#a78bfa;">FRAME M</strong><button data-role="copy-frame-m" title="Chốt Frame M" style="height:20px;padding:0 6px;border:none;border-radius:4px;background:#7c3aed;color:white;cursor:pointer;font-size:9px;font-weight:700;">Chốt Frame M</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
            <input data-role="frame-m-x" type="number" step="0.01" readonly placeholder="X" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
            <input data-role="frame-m-y" type="number" step="0.01" readonly placeholder="Y" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
            <input data-role="frame-m-z" type="number" step="0.01" readonly placeholder="Z" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
          </div>
        </div>
        <div data-role="keyframe-card" style="display:flex;flex-direction:column;gap:4px;margin-bottom:5px;">
          <div style="display:flex;align-items:center;justify-content:space-between;"><strong style="font-size:10px;color:#6ee7b7;">FRAME B</strong><button data-role="copy-frame-b" title="Chốt Frame B" style="height:20px;padding:0 6px;border:none;border-radius:4px;background:#059669;color:white;cursor:pointer;font-size:9px;font-weight:700;">Chốt Frame B</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
            <input data-role="frame-b-x" type="number" step="0.01" readonly placeholder="X" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
            <input data-role="frame-b-y" type="number" step="0.01" readonly placeholder="Y" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
            <input data-role="frame-b-z" type="number" step="0.01" readonly placeholder="Z" style="width:100%;height:22px;padding:1px 3px;box-sizing:border-box;border:1px solid #3d4755;border-radius:4px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:5px;margin-bottom:5px;padding:4px 6px;border:1px solid #0284c7;border-radius:4px;background:rgba(14, 116, 144, 0.15);font-size:10px;color:#7dd3fc;cursor:pointer;" title="Khi nội suy qua các frame trung gian, cao độ Z của xe sẽ tự động bám sát theo độ dốc mặt đường thay vì đường thẳng">
          <input data-role="interp-snap-ground" type="checkbox" checked style="width:13px;height:13px;flex:0 0 13px;" />
          <span>Khóa Z bám mặt đường khi nội suy</span>
        </label>
        <div data-role="frame-distance-result" style="padding:5px 6px;border:1px solid #3b4655;border-radius:4px;background:#111827;color:#dbe4ff;font-size:10px;line-height:1.5;">
          Ghi nhận XYZ từ hai frame để tính khoảng cách.
        </div>
        <button data-role="apply-frame-delta" title="Áp dụng vị trí nội suy cho Frame N đang chọn" style="width:100%;margin-top:6px;height:24px;border:none;border-radius:4px;background:#0284c7;color:white;cursor:pointer;font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;">
          ⚡ Áp dụng Nội Suy cho Frame N
        </button>

      </div>
    `;

    let dragState = null;
    const dragHeader = panel.querySelector('[data-role="drag-header"]');
    if (dragHeader) {
      dragHeader.addEventListener("mousedown", (event) => {
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLButtonElement
        )
          return;
        dragState = {
          startX: event.clientX,
          startY: event.clientY,
          left: parseFloat(panel.style.left || "16"),
          top: parseFloat(panel.style.top || "16"),
        };
      });

      window.addEventListener("mousemove", (event) => {
        if (!dragState) return;
        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        panel.style.left = `${dragState.left + dx}px`;
        panel.style.top = `${dragState.top + dy}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      });

      window.addEventListener("mouseup", () => {
        dragState = null;
      });
    }

    let panelCollapsed =
      localStorage.getItem("auto-lwh-panel-collapsed") === "true";
    const panelContent = panel.querySelector('[data-role="panel-content"]');
    const collapseButton = panel.querySelector('[data-role="panel-collapse"]');

    function applyPanelCollapsed() {
      if (panelContent)
        panelContent.style.display = panelCollapsed ? "none" : "block";
      if (collapseButton) {
        collapseButton.textContent = panelCollapsed ? "+" : "−";
        collapseButton.title = panelCollapsed
          ? "Mở rộng panel"
          : "Thu nhỏ panel";
      }
      if (!panelCollapsed) {
        panel.style.marginBottom = "";
      }
      localStorage.setItem("auto-lwh-panel-collapsed", String(panelCollapsed));
    }

    applyPanelCollapsed();

    function calculateFrameDistance() {
      const roles = [
        "frame-a-x",
        "frame-a-y",
        "frame-a-z",
        "frame-b-x",
        "frame-b-y",
        "frame-b-z",
      ];
      const values = roles.map((role) => {
        const input = panel.querySelector(`[data-role="${role}"]`);
        return input?.value.trim() === "" ? null : Number(input.value);
      });

      const result = panel.querySelector('[data-role="frame-distance-result"]');
      if (!result) return;

      if (values.some((value) => value === null || !Number.isFinite(value))) {
        result.textContent = "Ghi nhận để tính khoảng cách.";
        return null;
      }

      const [ax, ay, az, bx, by, bz] = values;
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const formatDelta = (value) =>
        `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;

      result.innerHTML = `
        <div><strong>ΔX:</strong> ${formatDelta(dx)} m</div>
        <div><strong>ΔY:</strong> ${formatDelta(dy)} m</div>
        <div><strong>ΔZ:</strong> ${formatDelta(dz)} m</div>
        <div style="margin-top:3px;color:#60a5fa;font-size:12px;"><strong>Khoảng cách:</strong> ${distance.toFixed(3)} m</div>
      `;

      return { dx, dy, dz, distance };
    }

    const frameInputRoles = [
      "frame-a-x",
      "frame-a-y",
      "frame-a-z",
      "frame-b-x",
      "frame-b-y",
      "frame-b-z",
    ];
    frameInputRoles.forEach((role) => {
      panel
        .querySelector(`[data-role="${role}"]`)
        ?.addEventListener("input", calculateFrameDistance);
    });

    const modeSelect = panel.querySelector(
      '[data-role="frame-interpolation-mode"]',
    );
    const frameMCard = panel.querySelector('[data-role="keyframe-card-m"]');
    const frameMInputWrapper = panel.querySelector(
      '[data-role="frame-m-input-wrapper"]',
    );

    function updateModeUI() {
      const curMode = modeSelect?.value || "linear";
      const isQuad = curMode === "quadratic";
      if (frameMCard) {
        frameMCard.style.opacity = isQuad ? "1" : "0.35";
        frameMCard.style.pointerEvents = isQuad ? "auto" : "none";
      }
      if (frameMInputWrapper) {
        frameMInputWrapper.style.opacity = isQuad ? "1" : "0.35";
        frameMInputWrapper.style.pointerEvents = isQuad ? "auto" : "none";
      }
    }

    if (modeSelect) {
      const savedMode = localStorage.getItem("auto-lwh-interpolation-mode");
      if (savedMode) modeSelect.value = savedMode;
      updateModeUI();
      modeSelect.addEventListener("change", () => {
        localStorage.setItem("auto-lwh-interpolation-mode", modeSelect.value);
        updateModeUI();
      });
    }

    let savedTab = localStorage.getItem("auto-lwh-panel-tab") || "transform";
    if (savedTab === "feedback") savedTab = "transform";
    const transformPane = panel.querySelector('[data-role="transform-pane"]');
    const autoFitPane = panel.querySelector('[data-role="auto-fit-pane"]');
    if (transformPane)
      transformPane.style.display = savedTab === "transform" ? "block" : "none";
    if (autoFitPane)
      autoFitPane.style.display = savedTab === "auto-fit" ? "block" : "none";
    panel.querySelectorAll('[data-role="tab-button"]').forEach((button) => {
      button.dataset.active = String(button.dataset.tab === savedTab);
    });

    const syncWh = panel.querySelector('[data-role="sync-wh"]');
    const syncLw = panel.querySelector('[data-role="sync-lw"]');
    if (syncWh)
      syncWh.checked = localStorage.getItem("auto-lwh-sync-wh") === "true";
    if (syncLw)
      syncLw.checked = localStorage.getItem("auto-lwh-sync-lw") === "true";

    syncWh?.addEventListener("change", () => {
      localStorage.setItem("auto-lwh-sync-wh", String(syncWh.checked));
    });
    syncLw?.addEventListener("change", () => {
      localStorage.setItem("auto-lwh-sync-lw", String(syncLw.checked));
    });

    const lockSideZoom = panel.querySelector('[data-role="lock-side-zoom"]');
    if (lockSideZoom) {
      const savedLock = localStorage.getItem("auto-lwh-lock-side-zoom");
      lockSideZoom.checked = savedLock === null ? true : savedLock === "true";
      lockSideZoom.addEventListener("change", () => {
        localStorage.setItem(
          "auto-lwh-lock-side-zoom",
          String(lockSideZoom.checked),
        );
        const pc = getPagePc();
        if (pc && Array.isArray(pc.renderViews)) {
          pc.renderViews.forEach((view) => {
            if (view && typeof view.fitObject === "function" && view.object) {
              if (!lockSideZoom.checked) {
                view.__force_center_reset__ = true;
                view.__pan_x__ = 0;
                view.__pan_y__ = 0;
              }
              view.fitObject(view.object);
              view.render?.();
              view.__force_center_reset__ = false;
            }
          });
        }
      });
    }

    const lockSideRotation = panel.querySelector(
      '[data-role="lock-side-rotation"]',
    );
    if (lockSideRotation) {
      const savedRotLock = localStorage.getItem("auto-lwh-lock-side-rotation");
      // Mặc định tắt để tránh hiện tượng lệch 2 box giữa 3D WebGL và khung 2D SVG
      lockSideRotation.checked = savedRotLock === "true";
      lockSideRotation.addEventListener("change", () => {
        localStorage.setItem(
          "auto-lwh-lock-side-rotation",
          String(lockSideRotation.checked),
        );
        const pc = getPagePc();
        if (pc && Array.isArray(pc.renderViews)) {
          pc.renderViews.forEach((view) => {
            if (view && typeof view.fitObject === "function" && view.object) {
              view.__force_heading_reset__ = true;
              view.fitObject(view.object);
              view.render?.();
            }
          });
        }
      });
    }

    const enableCrosshairCb = panel.querySelector(
      '[data-role="enable-crosshair-pin"]',
    );
    if (enableCrosshairCb) {
      enableCrosshairCb.checked = isCrosshairPinEnabled();
      enableCrosshairCb.addEventListener("change", () => {
        setCrosshairPinEnabled(enableCrosshairCb.checked);
      });
    }

    const enableGhostCb = panel.querySelector('[data-role="enable-ghost-box"]');
    if (enableGhostCb) {
      enableGhostCb.checked = isGhostBoxEnabled();
      enableGhostCb.addEventListener("change", () => {
        setGhostBoxEnabled(enableGhostCb.checked);
      });
    }

    const resetCrosshairBtn = panel.querySelector(
      '[data-role="reset-crosshair-btn"]',
    );
    if (resetCrosshairBtn) {
      resetCrosshairBtn.addEventListener("click", () => {
        resetCrosshairPositions();
      });
    }

    const lockGhostBtn = panel.querySelector('[data-role="lock-ghost-btn"]');
    if (lockGhostBtn) {
      lockGhostBtn.addEventListener("click", () => {
        toggleLockGhost();
      });
    }

    // Cài đặt các điều khiển Căn chỉnh mặt đường (Ground Alignment)
    const groundOffsetInput = panel.querySelector(
      '[data-role="ground-offset-input"]',
    );
    if (groundOffsetInput) {
      groundOffsetInput.value = getSavedGroundOffset().toFixed(2);
      groundOffsetInput.addEventListener("input", () => {
        const val = parseFloat(groundOffsetInput.value);
        if (Number.isFinite(val)) {
          localStorage.setItem("auto-lwh-ground-offset", String(val));
          updatePositionPanel();
        }
      });
    }

    const autoSnapGround = panel.querySelector(
      '[data-role="auto-snap-ground"]',
    );
    if (autoSnapGround) {
      autoSnapGround.checked =
        localStorage.getItem("auto-lwh-auto-snap-ground") === "true";
      autoSnapGround.addEventListener("change", () => {
        localStorage.setItem(
          "auto-lwh-auto-snap-ground",
          String(autoSnapGround.checked),
        );
        if (autoSnapGround.checked) {
          const obj = getSelectedObject();
          if (obj) snapObjectToGround(obj);
        }
      });
    }

    const boxPivotMode = panel.querySelector('[data-role="box-pivot-mode"]');
    if (boxPivotMode) {
      boxPivotMode.value = localStorage.getItem("auto-lwh-pivot-mode") || "auto";
      boxPivotMode.addEventListener("change", () => {
        localStorage.setItem("auto-lwh-pivot-mode", boxPivotMode.value);
        updatePositionPanel();
      });
    }

    const interpSnapGround = panel.querySelector(
      '[data-role="interp-snap-ground"]',
    );
    if (interpSnapGround) {
      const savedInterpSnap = localStorage.getItem(
        "auto-lwh-interp-snap-ground",
      );
      interpSnapGround.checked =
        savedInterpSnap === null ? true : savedInterpSnap === "true";
      interpSnapGround.addEventListener("change", () => {
        localStorage.setItem(
          "auto-lwh-interp-snap-ground",
          String(interpSnapGround.checked),
        );
      });
    }

    const refIdInput = panel.querySelector('[data-role="ref-id-input"]');
    if (refIdInput) {
      refIdInput.value = localStorage.getItem("auto-lwh-ref-id") || "";
      refIdInput.addEventListener("input", (e) => {
        localStorage.setItem("auto-lwh-ref-id", e.target.value.trim());
      });
    }

    const refSyncMode = panel.querySelector('[data-role="ref-sync-mode"]');
    const refGapInput = panel.querySelector('[data-role="ref-gap-input"]');

    if (refSyncMode) {
      const savedMode = getSavedRefMode();
      refSyncMode.value = savedMode;

      if (refGapInput) {
        refGapInput.value = getSavedRefGap(savedMode).toFixed(2);
      }

      refSyncMode.addEventListener("change", (e) => {
        const newMode = e.target.value;
        setSavedRefMode(newMode);
        if (refGapInput) {
          refGapInput.value = getSavedRefGap(newMode).toFixed(2);
        }
        // Cập nhật vị trí realtime khi đổi hướng/chế độ
        const curObj = getSelectedObject();
        if (curObj && panel.querySelector('[data-role="ref-id-input"]')?.value?.trim()) {
          applyRefZ(curObj);
        }
      });
    }

    if (refGapInput) {
      refGapInput.addEventListener("input", (e) => {
        const currentMode = refSyncMode?.value || getSavedRefMode();
        setSavedRefGap(currentMode, e.target.value);
        // Cập nhật vị trí realtime khi thay đổi độ hở
        const curObj = getSelectedObject();
        if (curObj && panel.querySelector('[data-role="ref-id-input"]')?.value?.trim()) {
          applyRefZ(curObj);
        }
      });

      // Hỗ trợ cuộn chuột trên ô độ hở để tăng/giảm realtime
      refGapInput.addEventListener(
        "wheel",
        (e) => {
          if (document.activeElement === refGapInput) {
            e.preventDefault();
            const step = e.shiftKey ? 0.05 : 0.01;
            let cur = parseFloat(refGapInput.value) || 0;
            cur += e.deltaY < 0 ? step : -step;
            refGapInput.value = cur.toFixed(2);
            refGapInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
        },
        { passive: false },
      );
    }

    const autoRefZCheckbox = panel.querySelector(
      '[data-role="auto-ref-z-checkbox"]',
    );
    if (autoRefZCheckbox) {
      autoRefZCheckbox.checked =
        localStorage.getItem("auto-lwh-auto-ref-z") === "true";
      autoRefZCheckbox.addEventListener("change", (e) => {
        localStorage.setItem("auto-lwh-auto-ref-z", String(e.target.checked));
        if (e.target.checked) checkAutoApplyRefZ();
      });
    }

    const autoSpawnConeCheckbox = panel.querySelector(
      '[data-role="auto-spawn-cone"]',
    );
    if (autoSpawnConeCheckbox) {
      // Giá trị luôn mặc định là false khi mở/nạp lại trang, chỉ true khi người dùng tự tay tích chọn
      autoSpawnConeCheckbox.checked = false;
      localStorage.removeItem("auto-lwh-auto-spawn-cone");

      autoSpawnConeCheckbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          localStorage.setItem("auto-lwh-auto-spawn-cone", "true");
        } else {
          localStorage.removeItem("auto-lwh-auto-spawn-cone");
        }
      });
    }

    panel.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const role = target.dataset.role;
      if (
        role === "copy-frame-a" ||
        role === "copy-frame-m" ||
        role === "copy-frame-b"
      ) {
        const obj = getSelectedObject();
        if (!obj?.position) return;
        const prefix =
          role === "copy-frame-a"
            ? "frame-a"
            : role === "copy-frame-m"
              ? "frame-m"
              : "frame-b";

        const curFrameNum = getCurrentFrameNumber();
        if (curFrameNum !== null && Number.isFinite(curFrameNum)) {
          if (role === "copy-frame-a") {
            const startInput = panel.querySelector(
              '[data-role="frame-start-index"]',
            );
            if (startInput) startInput.value = curFrameNum;
          } else if (role === "copy-frame-m") {
            const middleInput = panel.querySelector(
              '[data-role="frame-middle-index"]',
            );
            if (middleInput) middleInput.value = curFrameNum;
          } else if (role === "copy-frame-b") {
            const endInput = panel.querySelector(
              '[data-role="frame-end-index"]',
            );
            if (endInput) endInput.value = curFrameNum;
          }
        }

        const px = Number(obj.position.x);
        const py = Number(obj.position.y);
        const pz = Number(obj.position.z);
        const xEl = panel.querySelector(`[data-role="${prefix}-x"]`);
        const yEl = panel.querySelector(`[data-role="${prefix}-y"]`);
        const zEl = panel.querySelector(`[data-role="${prefix}-z"]`);
        if (xEl) xEl.value = Number.isFinite(px) ? px.toFixed(3) : "0.000";
        if (yEl) yEl.value = Number.isFinite(py) ? py.toFixed(3) : "0.000";
        if (zEl) zEl.value = Number.isFinite(pz) ? pz.toFixed(3) : "0.000";
        calculateFrameDistance();
      }
      if (role === "apply-frame-delta") {
        const obj = getSelectedObject();
        if (!obj?.position) return;
        const delta = calculateFrameDistance();
        if (!delta) return;

        const startInput = panel.querySelector(
          '[data-role="frame-start-index"]',
        );
        const currentInput = panel.querySelector(
          '[data-role="frame-current-index"]',
        );
        const endInput = panel.querySelector('[data-role="frame-end-index"]');
        const startFrame = Number(startInput?.value);
        const currentFrame = Number(currentInput?.value);
        const endFrame = Number(endInput?.value);

        if (
          ![startFrame, currentFrame, endFrame].every(Number.isFinite) ||
          endFrame === startFrame
        ) {
          const result = panel.querySelector(
            '[data-role="frame-distance-result"]',
          );
          if (result)
            result.textContent =
              "Nhập Frame bắt đầu, Frame hiện tại và Frame kết thúc.";
          return;
        }

        const ratio = (currentFrame - startFrame) / (endFrame - startFrame);
        if (ratio < 0 || ratio > 1) {
          const result = panel.querySelector(
            '[data-role="frame-distance-result"]',
          );
          if (result)
            result.textContent =
              "Frame hiện tại phải nằm trong khoảng bắt đầu và kết thúc.";
          return;
        }

        const ax = Number(
          panel.querySelector('[data-role="frame-a-x"]')?.value,
        );
        const ay = Number(
          panel.querySelector('[data-role="frame-a-y"]')?.value,
        );
        const az = Number(
          panel.querySelector('[data-role="frame-a-z"]')?.value,
        );
        const bx = Number(
          panel.querySelector('[data-role="frame-b-x"]')?.value,
        );
        const by = Number(
          panel.querySelector('[data-role="frame-b-y"]')?.value,
        );
        const bz = Number(
          panel.querySelector('[data-role="frame-b-z"]')?.value,
        );

        const mode =
          panel.querySelector('[data-role="frame-interpolation-mode"]')
            ?.value || "linear";
        let targetX;
        let targetY;
        let targetZ;

        if (mode === "quadratic") {
          const middleInput = panel.querySelector(
            '[data-role="frame-middle-index"]',
          );
          const middleFrame = Number(middleInput?.value);
          if (
            !Number.isFinite(middleFrame) ||
            middleFrame <= startFrame ||
            middleFrame >= endFrame
          ) {
            const result = panel.querySelector(
              '[data-role="frame-distance-result"]',
            );
            if (result)
              result.textContent =
                "Frame M phải nằm giữa Frame bắt đầu và Frame kết thúc.";
            return;
          }

          const mx = Number(
            panel.querySelector('[data-role="frame-m-x"]')?.value,
          );
          const my = Number(
            panel.querySelector('[data-role="frame-m-y"]')?.value,
          );
          const mz = Number(
            panel.querySelector('[data-role="frame-m-z"]')?.value,
          );
          if (![mx, my, mz].every(Number.isFinite)) {
            const result = panel.querySelector(
              '[data-role="frame-distance-result"]',
            );
            if (result) result.textContent = "Ghi nhận đủ XYZ tại Frame M.";
            return;
          }

          function quadraticAt(a0, a1, a2) {
            const u = (currentFrame - startFrame) / (endFrame - startFrame);
            const middleRatio =
              (middleFrame - startFrame) / (endFrame - startFrame);
            const l0 =
              ((u - middleRatio) * (u - 1)) / ((0 - middleRatio) * (0 - 1));
            const l1 = (u * (u - 1)) / (middleRatio * (middleRatio - 1));
            const l2 = (u * (u - middleRatio)) / ((1 - middleRatio) * (1 - 0));
            return a0 * l0 + a1 * l1 + a2 * l2;
          }

          targetX = quadraticAt(ax, mx, bx);
          targetY = quadraticAt(ay, my, by);
          targetZ = quadraticAt(az, mz, bz);
        } else {
          let u = ratio;
          if (mode === "ease-out") {
            // Phanh chậm dần (Decelerate): u = 1 - (1 - t)^2
            u = 1 - Math.pow(1 - ratio, 2);
          } else if (mode === "ease-in") {
            // Tăng tốc (Accelerate): u = t^2
            u = Math.pow(ratio, 2);
          } else if (mode === "ease-in-out") {
            // S-Curve (Smoothstep): u = 3t^2 - 2t^3
            u = 3 * Math.pow(ratio, 2) - 2 * Math.pow(ratio, 3);
          }

          targetX = ax + (bx - ax) * u;
          targetY = ay + (by - ay) * u;
          targetZ = az + (bz - az) * u;
        }

        const isInterpSnapGround =
          panel.querySelector('[data-role="interp-snap-ground"]')?.checked ??
          localStorage.getItem("auto-lwh-interp-snap-ground") !== "false";

        if (isInterpSnapGround) {
          const halfH = (obj.scale?.z || 1.5) / 2;
          const isBottom = isObjectBottomPivot(obj);
          const refBottomZ = isBottom ? targetZ : targetZ - halfH;
          const detected = detectGroundZ(
            targetX,
            targetY,
            refBottomZ,
            obj.scale?.x,
            obj.scale?.y,
          );
          if (detected && typeof detected.groundZ === "number") {
            const offset = getSavedGroundOffset();
            targetZ = isBottom
              ? detected.groundZ + offset
              : detected.groundZ + halfH + offset;
          }
        }

        applyObjectTransform(obj, {
          position: { x: targetX, y: targetY, z: targetZ },
        });

        const distResult = panel.querySelector(
          '[data-role="frame-distance-result"]',
        );
        if (distResult) {
          const modeLabels = {
            linear: "Đi đều (Linear)",
            "ease-out": "Phanh chậm dần (Ease-Out)",
            "ease-in": "Tăng tốc (Ease-In)",
            "ease-in-out": "S-Curve",
            quadratic: "Tự do 3 điểm A-M-B",
          };
          const curLabel = modeLabels[mode] || mode;
          const statusDiv = distResult.querySelector(
            '[data-role="interp-status"]',
          );
          const msg = `<div data-role="interp-status" style="margin-top:5px;padding:4px 6px;border-radius:4px;background:#14532d;color:#86efac;font-size:11px;font-weight:700;">✓ Frame ${currentFrame} đã nội suy [${curLabel}]</div>`;
          if (statusDiv) {
            statusDiv.outerHTML = msg;
          } else {
            distResult.innerHTML += msg;
          }
        }

        const pc = getPagePc();
        if (pc && typeof pc.selectObject === "function") {
          pc.selectObject(obj);
        }

        updatePositionPanel();
        requestAnimationFrame(() => updatePositionPanel());
      }
      if (role === "tab-button") {
        const tab = target.dataset.tab;
        const transformPane = panel.querySelector(
          '[data-role="transform-pane"]',
        );
        const autoFitPane = panel.querySelector('[data-role="auto-fit-pane"]');
        panel.querySelectorAll('[data-role="tab-button"]').forEach((button) => {
          button.dataset.active = String(button === target);
        });
        if (transformPane)
          transformPane.style.display = tab === "transform" ? "block" : "none";
        if (autoFitPane)
          autoFitPane.style.display = tab === "auto-fit" ? "block" : "none";
        localStorage.setItem("auto-lwh-panel-tab", tab || "transform");
      }
      if (
        role === "snap-signboard-btn" ||
        target.closest('[data-role="snap-signboard-btn"]')
      ) {
        const obj = getSelectedObject();
        if (obj) snapObjectSignboard(obj);
      }
      if (
        role === "apply-ref-z-btn" ||
        target.closest('[data-role="apply-ref-z-btn"]')
      ) {
        const obj = getSelectedObject();
        applyRefZ(obj);
      }
      if (
        role === "lock-benchmark-btn" ||
        target.closest('[data-role="lock-benchmark-btn"]') ||
        role === "quick-lock-btn" ||
        target.closest('[data-role="quick-lock-btn"]')
      ) {
        lockBenchmarkRelation();
      }
      if (
        role === "spawn-cone-b-btn" ||
        target.closest('[data-role="spawn-cone-b-btn"]')
      ) {
        spawnConeB();
      }
      if (
        role === "batch-sync-cone-btn" ||
        target.closest('[data-role="batch-sync-cone-btn"]')
      ) {
        batchSyncConeB();
      }
      if (
        role === "ref-pick-id-btn" ||
        target.closest('[data-role="ref-pick-id-btn"]')
      ) {
        const curObj = getSelectedObject();
        if (curObj) {
          const trackName =
            curObj.userData?.trackName ||
            curObj.userData?.trackId ||
            curObj.id ||
            "";
          const refIdInput = panel.querySelector('[data-role="ref-id-input"]');
          if (trackName && refIdInput) {
            refIdInput.value = String(trackName);
            localStorage.setItem("auto-lwh-ref-id", String(trackName));
            const badge = panel.querySelector('[data-role="ref-z-badge"]');
            if (badge) {
              badge.textContent = `Đã ghim #${trackName}`;
              badge.style.background = "#312e81";
              badge.style.color = "#c7d2fe";
            }
            updatePositionPanel();
          }
        }
      }
      if (
        role === "ref-dist-gap" ||
        target.closest('[data-role="ref-dist-gap"]')
      ) {
        const gapSpan = target.closest('[data-role="ref-dist-gap"]');
        const gapVal = gapSpan?.dataset?.gap;
        const refGapInput = panel.querySelector('[data-role="ref-gap-input"]');
        if (gapVal !== undefined && refGapInput) {
          refGapInput.value = parseFloat(gapVal).toFixed(2);
          refGapInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      if (
        role === "snap-overhead-btn" ||
        target.closest('[data-role="snap-overhead-btn"]')
      ) {
        const obj = getSelectedObject();
        if (obj) snapObjectOverhead(obj);
      }
      if (
        role === "snap-all-btn" ||
        target.closest('[data-role="snap-all-btn"]')
      ) {
        const obj = getSelectedObject();
        if (obj) snapObjectAll(obj);
      }
      if (
        role === "snap-ground-btn" ||
        target.closest('[data-role="snap-ground-btn"]')
      ) {
        const obj = getSelectedObject();
        if (obj) snapObjectToGround(obj);
      }
      if (role === "offset-preset") {
        const offsetVal = parseFloat(target.dataset.offset || "0");
        const offsetInput = panel.querySelector(
          '[data-role="ground-offset-input"]',
        );
        if (offsetInput) offsetInput.value = offsetVal.toFixed(2);
        localStorage.setItem("auto-lwh-ground-offset", String(offsetVal));
        const obj = getSelectedObject();
        if (obj) snapObjectToGround(obj, offsetVal);
      }
      if (role === "signal") applySignalSize();
      if (role === "cone") applyConeSize();
      if (role === "yaw-step-minus" || role === "yaw-step-plus") {
        const step = role === "yaw-step-plus" ? 1 : -1;
        const yawInput = panel.querySelector('[data-role="yaw"]');
        if (yawInput) {
          let curDeg = parseFloat(yawInput.value);
          if (!Number.isFinite(curDeg)) curDeg = 0;
          yawInput.value = (curDeg + step).toFixed(2);
          applySelectedYaw();
        }
      }
      if (role === "panel-collapse") {
        panelCollapsed = !panelCollapsed;
        applyPanelCollapsed();
      }
    });

    panel.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const role = target.dataset?.role;
      if (["x", "y", "z"].includes(role)) {
        applySelectedPosition();
      }
      if (["l", "w", "h"].includes(role)) {
        applySelectedLwh(role);
      }
      if (role === "yaw") {
        applySelectedYaw();
      }
    });

    // Khi đang nhập thông số, bấm Enter hoặc Escape sẽ tự động áp dụng và focus trả lại trang web / canvas 3D
    panel.addEventListener("keydown", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        if (event.key === "Enter") {
          const role = target.dataset?.role;
          if (["x", "y", "z"].includes(role)) {
            applySelectedPosition();
          } else if (["l", "w", "h"].includes(role)) {
            applySelectedLwh(role);
          } else if (role === "yaw") {
            applySelectedYaw();
          } else if (role === "ground-offset-input") {
            const offsetVal = parseFloat(target.value || "0");
            localStorage.setItem("auto-lwh-ground-offset", String(offsetVal));
            const obj = getSelectedObject();
            if (obj) snapObjectToGround(obj, offsetVal);
          } else if (role === "ref-id-input" || role === "ref-gap-input") {
            if (role === "ref-gap-input") {
              const currentMode = panel.querySelector('[data-role="ref-sync-mode"]')?.value || getSavedRefMode();
              setSavedRefGap(currentMode, target.value);
            }
            const obj = getSelectedObject();
            if (obj) applyRefZ(obj);
          } else {
            target.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }

        target.blur();
        focusWebCanvas();
      }
    });

    document.body.appendChild(panel);
    return panel;
  }

  function focusWebCanvas() {
    try {
      const pc = getPagePc();
      const canvas =
        pc?.renderViews?.[0]?.container?.querySelector("canvas") ||
        pc?.container?.querySelector("canvas") ||
        document.querySelector("div.main-view canvas, canvas.main-canvas, #editor canvas, canvas");

      if (canvas) {
        if (!canvas.hasAttribute("tabindex")) {
          canvas.setAttribute("tabindex", "-1");
        }
        canvas.focus();
        canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      } else {
        const mainContainer = pc?.container || document.querySelector(".pc-editor, #app, body");
        if (mainContainer) {
          if (!mainContainer.hasAttribute("tabindex")) {
            mainContainer.setAttribute("tabindex", "-1");
          }
          mainContainer.focus();
        }
      }
      window.focus();
    } catch (e) {
      document.body?.focus?.();
      window.focus();
    }
  }

  function isPositionPanelEditing() {
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!panel) return false;

    const active = document.activeElement;
    if (!active) return false;
    return (
      panel.contains(active) &&
      (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA")
    );
  }

  function updatePositionPanel() {
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!panel) return;

    const obj = getSelectedObject();
    const xInput = panel.querySelector('[data-role="x"]');
    const yInput = panel.querySelector('[data-role="y"]');
    const zInput = panel.querySelector('[data-role="z"]');
    const lInput = panel.querySelector('[data-role="l"]');
    const wInput = panel.querySelector('[data-role="w"]');
    const hInput = panel.querySelector('[data-role="h"]');
    const yawInput = panel.querySelector('[data-role="yaw"]');
    const statusEl = panel.querySelector('[data-role="status"]');
    const classNameEl = panel.querySelector('[data-role="class-name"]');
    const isEditing = isPositionPanelEditing();

    if (classNameEl) {
      const className = getSelectedClassName();
      classNameEl.textContent = `Class: ${className}`;
      classNameEl.title = className;
    }

    const groundBadge = panel.querySelector('[data-role="ground-diff-badge"]');
    const groundSnapBtn = panel.querySelector('[data-role="snap-ground-btn"]');

    if (!obj) {
      if (statusEl) statusEl.textContent = "No object selected";
      const overheadBadge = panel.querySelector(
        '[data-role="overhead-fit-badge"]',
      );
      if (overheadBadge) {
        overheadBadge.textContent = "Sườn: --";
        overheadBadge.style.background = "#263447";
        overheadBadge.style.color = "#94a3b8";
      }
      if (groundBadge) {
        groundBadge.textContent = "Đáy: --";
        groundBadge.style.background = "#263447";
        groundBadge.style.color = "#94a3b8";
        groundBadge.title = "";
      }
      const distInfoEl = panel.querySelector('[data-role="ref-distance-info"]');
      if (distInfoEl) distInfoEl.style.display = "none";
      if (groundSnapBtn) groundSnapBtn.style.opacity = "0.6";
      if (!isEditing) {
        if (xInput) xInput.value = "0";
        if (yInput) yInput.value = "0";
        if (zInput) zInput.value = "0";
        if (lInput) lInput.value = "0";
        if (wInput) wInput.value = "0";
        if (hInput) hInput.value = "0";
        if (yawInput) yawInput.value = "0";
      }
      return;
    }

    if (groundSnapBtn) groundSnapBtn.style.opacity = "1";

    if (groundBadge && obj.position && obj.scale) {
      const halfH = (obj.scale.z || 1.5) / 2;
      const isBottom = isObjectBottomPivot(obj);
      const curBottom = isBottom ? obj.position.z : obj.position.z - halfH;
      const offsetInput = panel.querySelector(
        '[data-role="ground-offset-input"]',
      );
      const offset =
        offsetInput && Number.isFinite(parseFloat(offsetInput.value))
          ? parseFloat(offsetInput.value)
          : getSavedGroundOffset();

      const detected = detectGroundZ(
        obj.position.x,
        obj.position.y,
        curBottom,
        obj.scale.x,
        obj.scale.y,
      );

      if (detected && typeof detected.groundZ === "number") {
        const targetBottom = detected.groundZ + offset;
        const diff = curBottom - targetBottom;
        const diffCm = Math.round(diff * 100);
        const pivotTag = isBottom ? "Đáy (BasicAI)" : "Tâm (Local)";

        if (Math.abs(diffCm) <= 2) {
          groundBadge.textContent = "🟢 Sát đường";
          groundBadge.style.background = "#14532d";
          groundBadge.style.color = "#86efac";
          groundBadge.title = `Đáy box: ${curBottom.toFixed(2)}m | Đường: ${detected.groundZ.toFixed(2)}m (Khớp sát - ${pivotTag})`;
        } else if (diffCm > 2) {
          groundBadge.textContent = `🟡 +${diffCm}cm`;
          groundBadge.style.background = "#713f12";
          groundBadge.style.color = "#fde047";
          groundBadge.title = `Đáy box: ${curBottom.toFixed(2)}m | Đường: ${detected.groundZ.toFixed(2)}m (Đang bay cao hơn đường ${diffCm}cm - ${pivotTag})`;
        } else {
          groundBadge.textContent = `🔴 ${diffCm}cm`;
          groundBadge.style.background = "#7f1d1d";
          groundBadge.style.color = "#fca5a5";
          groundBadge.title = `Đáy box: ${curBottom.toFixed(2)}m | Đường: ${detected.groundZ.toFixed(2)}m (Đang lún dưới mặt đường ${Math.abs(diffCm)}cm - ${pivotTag})`;
        }
      } else {
        groundBadge.textContent = "Không thấy đường";
        groundBadge.style.background = "#334155";
        groundBadge.style.color = "#94a3b8";
        groundBadge.title = "";
      }
    }

    if (!isEditing) {
      if (obj.position) {
        const px = Number(obj.position.x);
        const py = Number(obj.position.y);
        const pz = Number(obj.position.z);
        if (xInput) xInput.value = Number.isFinite(px) ? px.toFixed(2) : "0.00";
        if (yInput) yInput.value = Number.isFinite(py) ? py.toFixed(2) : "0.00";
        if (zInput) zInput.value = Number.isFinite(pz) ? pz.toFixed(2) : "0.00";
      }
      if (obj.scale) {
        const sx = Number(obj.scale.x);
        const sy = Number(obj.scale.y);
        const sz = Number(obj.scale.z);
        if (lInput) lInput.value = Number.isFinite(sx) ? sx.toFixed(2) : "0.00";
        if (wInput) wInput.value = Number.isFinite(sy) ? sy.toFixed(2) : "0.00";
        if (hInput) hInput.value = Number.isFinite(sz) ? sz.toFixed(2) : "0.00";
      }
      if (yawInput) {
        const rz = Number(obj.rotation?.z);
        const yawDeg = Number.isFinite(rz) ? rz * (180 / Math.PI) : 0;
        yawInput.value = Number.isFinite(yawDeg) ? yawDeg.toFixed(2) : "0.00";
      }
    }

    if (statusEl) {
      const px = Number(obj.position?.x);
      const py = Number(obj.position?.y);
      const pz = Number(obj.position?.z);
      const posText = Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)
        ? `${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)}`
        : "n/a";
      const sx = Number(obj.scale?.x);
      const sy = Number(obj.scale?.y);
      const sz = Number(obj.scale?.z);
      const sizeText = Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sz)
        ? `${sx.toFixed(2)}, ${sy.toFixed(2)}, ${sz.toFixed(2)}`
        : "n/a";
      statusEl.textContent = `Pos: ${posText} | Size: ${sizeText}`;
    }

    // Cập nhật thông số khoảng cách Real-time tới Reference Object (Cone A)
    const distInfoEl = panel.querySelector('[data-role="ref-distance-info"]');
    const refInput = panel.querySelector('[data-role="ref-id-input"]');
    const refId = refInput?.value?.trim();

    if (distInfoEl && obj && refId) {
      const refObj = findObjectByRefId(refId);
      if (
        refObj &&
        refObj !== obj &&
        refObj.uuid !== obj.uuid &&
        refObj.position &&
        obj.position
      ) {
        const dx = (obj.position.x || 0) - (refObj.position.x || 0);
        const dy = (obj.position.y || 0) - (refObj.position.y || 0);
        const dz = (obj.position.z || 0) - (refObj.position.z || 0);
        const dist2D = Math.hypot(dx, dy);
        const dist3D = Math.hypot(dx, dy, dz);

        // Khoảng cách mép (edge gap) ước tính
        const radiusRef =
          Math.max(refObj.scale?.x || 0.41, refObj.scale?.y || 0.41) / 2;
        const radiusCur =
          Math.max(obj.scale?.x || 0.41, obj.scale?.y || 0.41) / 2;
        const edgeGap = Math.max(0, dist2D - radiusRef - radiusCur);

        const titleEl = distInfoEl.querySelector('[data-role="ref-dist-title"]');
        const dist2dEl = distInfoEl.querySelector('[data-role="ref-dist-2d"]');
        const detailsEl = distInfoEl.querySelector(
          '[data-role="ref-dist-details"]',
        );

        const refName = refObj.userData?.trackName || refId;
        if (titleEl) titleEl.textContent = `📏 Tới #${refName}:`;
        if (dist2dEl) {
          dist2dEl.textContent = `2D: ${dist2D.toFixed(2)}m (3D: ${dist3D.toFixed(2)}m)`;
        }
        if (detailsEl) {
          const signX = dx >= 0 ? "+" : "";
          const signY = dy >= 0 ? "+" : "";
          const signZ = dz >= 0 ? "+" : "";
          detailsEl.innerHTML = `<span>ΔX: ${signX}${dx.toFixed(2)}m | ΔY: ${signY}${dy.toFixed(2)}m | ΔZ: ${signZ}${dz.toFixed(2)}m</span><span data-role="ref-dist-gap" data-gap="${edgeGap.toFixed(2)}" style="color:#fde047;font-weight:700;cursor:pointer;" title="Click để lấy độ hở này vào ô Hở">Hở: ${edgeGap.toFixed(2)}m</span>`;
        }
        distInfoEl.style.display = "block";
      } else {
        distInfoEl.style.display = "none";
      }
    } else if (distInfoEl) {
      distInfoEl.style.display = "none";
    }

    const rel = getSavedConeRelation();
    const benchmarkBanner = panel.querySelector('[data-role="ref-benchmark-status"]');
    if (benchmarkBanner) {
      if (rel && rel.refTrackName && rel.targetTrackName) {
        benchmarkBanner.style.display = "block";
        const dXStr = Number.isFinite(rel.deltaX) ? `${rel.deltaX >= 0 ? '+' : ''}${rel.deltaX.toFixed(2)}m` : "--";
        const dYStr = Number.isFinite(rel.deltaY) ? `${rel.deltaY >= 0 ? '+' : ''}${rel.deltaY.toFixed(2)}m` : "--";
        const dZStr = Number.isFinite(rel.deltaZ) ? `${rel.deltaZ >= 0 ? '+' : ''}${rel.deltaZ.toFixed(2)}m` : "--";
        benchmarkBanner.innerHTML = `⭐ <b>Chuẩn F${rel.benchmarkFrame || "?"}:</b> #${rel.refTrackName} ➜ #${rel.targetTrackName} | Cự ly: <b>${rel.dist2D?.toFixed(2) || "?"}m</b> (Hở: ${rel.gap?.toFixed(2) || "0.00"}m)<br/><span style="color:#cbd5e1;font-size:8.5px;">ΔX: ${dXStr} | ΔY: ${dYStr} | ΔZ: ${dZStr}</span><br/><span style="color:#6ee7b7;font-size:8.5px;font-weight:600;">✓ Sang frame mới: bấm <b>Alt+B</b> hoặc chuyển frame để tự sinh Cone B</span>`;
      } else {
        benchmarkBanner.style.display = "none";
      }
    }

    updateCurrentFrameInput();
  }

  function updateCurrentFrameInput() {
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!panel) return;
    const currentInput = panel.querySelector(
      '[data-role="frame-current-index"]',
    );
    const curNum = getCurrentFrameNumber();
    if (currentInput && document.activeElement !== currentInput) {
      if (curNum !== null && Number.isFinite(curNum) && String(currentInput.value) !== String(curNum)) {
        currentInput.value = String(curNum);
      }
    }

    // Tự động điền giá trị mẫu ban đầu cho ô Từ Frame - Đến Frame nếu đang rỗng
    const fromInput = panel.querySelector('[data-role="batch-from-frame"]');
    const toInput = panel.querySelector('[data-role="batch-to-frame"]');
    const editor = window.editor || window.__APP__?.editor || window.app?.editor;
    const totalF = Array.isArray(editor?.state?.frames) ? editor.state.frames.length : null;

    if (fromInput && document.activeElement !== fromInput && !fromInput.value && curNum !== null) {
      fromInput.value = String(curNum);
    }
    if (toInput && document.activeElement !== toInput && !toInput.value && totalF) {
      toInput.value = String(totalF);
    }
  }

  function applySelectedPosition() {
    const obj = getSelectedObject();
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!obj || !obj.position || !panel) return false;

    const xInput = panel.querySelector('[data-role="x"]');
    const yInput = panel.querySelector('[data-role="y"]');
    const zInput = panel.querySelector('[data-role="z"]');
    const statusEl = panel.querySelector('[data-role="status"]');

    const x = Number(xInput?.value ?? obj.position.x);
    const y = Number(yInput?.value ?? obj.position.y);
    const z = Number(zInput?.value ?? obj.position.z);

    const same =
      Math.abs(obj.position.x - x) < 1e-5 &&
      Math.abs(obj.position.y - y) < 1e-5 &&
      Math.abs(obj.position.z - z) < 1e-5;

    if (same) {
      if (statusEl) {
        statusEl.textContent = `Already at: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
      }
      return true;
    }

    try {
      const target = getSelectedObject();
      if (!target || !target.position) return false;

      applyObjectTransform(target, { position: { x, y, z } });

      const pc = getPagePc();
      if (pc && typeof pc.selectObject === "function") {
        pc.selectObject(target);
      }

      if (statusEl) {
        statusEl.textContent = `Updated: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
      }

      console.log("Updated selection[0].position:", { x, y, z });
      requestAnimationFrame(() => updatePositionPanel());
      return true;
    } catch (error) {
      console.error("applySelectedPosition failed:", error);
      if (statusEl) {
        statusEl.textContent = "Apply failed. Check console.";
      }
      return false;
    }
  }

  function copySelectedPosition() {
    const obj = getSelectedObject();
    if (!obj || !obj.position) return false;

    const text = `${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    return true;
  }

  function nudgeSelectedPosition({ dx = 0, dy = 0, dz = 0, dYaw = 0 }) {
    const obj = getSelectedObject();
    if (!obj || !obj.position) return false;

    const payload = {};

    if (dx !== 0 || dy !== 0 || dz !== 0) {
      const curX = Number(obj.position.x) || 0;
      const curY = Number(obj.position.y) || 0;
      const curZ = Number(obj.position.z) || 0;

      const nextX = Math.round((curX + dx) * 1000) / 1000;
      const nextY = Math.round((curY + dy) * 1000) / 1000;
      const nextZ = Math.round((curZ + dz) * 1000) / 1000;

      payload.position = { x: nextX, y: nextY, z: nextZ };
    }

    if (dYaw !== 0) {
      let curYawDeg = 0;
      if (obj.rotation) {
        curYawDeg = (Number(obj.rotation.z) || 0) * (180 / Math.PI);
      }
      const nextYawDeg = curYawDeg + dYaw;
      const nextYawRad = nextYawDeg * (Math.PI / 180);

      if (obj.rotation && typeof obj.rotation.clone === "function") {
        const nextRot = obj.rotation.clone();
        nextRot.z = nextYawRad;
        payload.rotation = nextRot;
      }
    }

    applyObjectTransform(obj, payload);
    recordCurrentObjectState();

    const pc = getPagePc();
    if (pc && Array.isArray(pc.renderViews)) {
      pc.renderViews.forEach((v) => {
        if (typeof v.render === "function") v.render();
      });
    }
    if (typeof pc?.render === "function") {
      pc.render();
    }

    requestAnimationFrame(() => updatePositionPanel());
    return true;
  }

  // =========================================================================
  // METHOD 1: TÂM NGẮM GHIM MỐC DI ĐỘNG (DRAGGABLE CROSSHAIR PIN OVERLAY)
  // =========================================================================
  const CROSSHAIR_STORAGE_KEY = "auto-lwh-crosshair-pin-enabled";
  const CROSSHAIR_POS_KEY = "auto-lwh-crosshair-positions"; // JSON { [axis]: { x, y } }

  function getSavedCrosshairPositions() {
    try {
      return JSON.parse(localStorage.getItem(CROSSHAIR_POS_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function saveCrosshairPosition(axis, pctX, pctY) {
    try {
      const data = getSavedCrosshairPositions();
      data[axis] = { x: pctX, y: pctY };
      localStorage.setItem(CROSSHAIR_POS_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function isCrosshairPinEnabled() {
    return localStorage.getItem(CROSSHAIR_STORAGE_KEY) === "true";
  }

  function setCrosshairPinEnabled(enabled) {
    localStorage.setItem(CROSSHAIR_STORAGE_KEY, String(enabled));
    const panel = document.getElementById(POSITION_PANEL_ID);
    const cb = panel?.querySelector('[data-role="enable-crosshair-pin"]');
    if (cb) cb.checked = enabled;
    updateAllCrosshairOverlays();
  }

  function toggleCrosshairPin() {
    setCrosshairPinEnabled(!isCrosshairPinEnabled());
  }

  function resetCrosshairPositions() {
    try {
      localStorage.removeItem(CROSSHAIR_POS_KEY);
    } catch (_) {}
    const pc = getPagePc();
    if (!pc || !Array.isArray(pc.renderViews)) return;
    pc.renderViews.forEach((view) => {
      if (view?.container?.__auto_lwh_crosshair__) {
        view.container.__auto_lwh_crosshair__.setPosition(50, 50, true);
      }
    });
  }

  function setupCrosshairOverlay(view) {
    if (!view || !view.container || view.container.__auto_lwh_crosshair__) return;
    const container = view.container;

    try {
      const compPos = window.getComputedStyle(container).position;
      if (compPos === "static") {
        container.style.position = "relative";
      }
    } catch (_) {}

    const axis = String(view.axis || "view");
    const axisLabels = {
      z: "Overhead (Z)",
      y: "Side (Y)",
      "-y": "Side (-Y)",
      x: "Rear/Front (X)",
      "-x": "Rear/Front (-X)",
    };
    const axisName = axisLabels[axis] || `Khung (${axis})`;

    const overlay = document.createElement("div");
    overlay.className = "auto-lwh-crosshair-overlay";
    overlay.setAttribute("data-axis", axis);
    overlay.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:999;overflow:hidden;display:none;";

    const lineH = document.createElement("div");
    lineH.className = "crosshair-line-h";
    lineH.style.cssText =
      "position:absolute;left:0;right:0;height:1px;background:rgba(56,189,248,0.85);box-shadow:0 0 2px rgba(0,0,0,0.95);pointer-events:none;";

    const lineV = document.createElement("div");
    lineV.className = "crosshair-line-v";
    lineV.style.cssText =
      "position:absolute;top:0;bottom:0;width:1px;background:rgba(56,189,248,0.85);box-shadow:0 0 2px rgba(0,0,0,0.95);pointer-events:none;";

    const pinHandle = document.createElement("div");
    pinHandle.className = "crosshair-pin-handle";
    pinHandle.title = `🎯 Tâm ngắm mốc ghim [${axisName}]\n- Kéo thả để đặt vào mốc (vd: gương xe)\n- Hoặc giữ phím Alt + Click vào điểm bất kỳ\n- Double-click để đưa về giữa khung`;
    pinHandle.style.cssText =
      "position:absolute;width:22px;height:22px;margin-left:-11px;margin-top:-11px;border-radius:50%;border:2px solid #38bdf8;background:rgba(14,165,233,0.3);box-shadow:0 0 0 1.5px rgba(0,0,0,0.95),0 0 8px rgba(56,189,248,0.7);cursor:grab;pointer-events:auto;display:flex;align-items:center;justify-content:center;user-select:none;z-index:1000;";

    const pinDot = document.createElement("div");
    pinDot.style.cssText =
      "width:4px;height:4px;border-radius:50%;background:#ffffff;box-shadow:0 0 2px black;";
    pinHandle.appendChild(pinDot);

    const badge = document.createElement("div");
    badge.className = "crosshair-badge";
    badge.style.cssText =
      "position:absolute;left:14px;top:-16px;padding:1px 5px;font-size:8.5px;font-family:monospace;font-weight:700;color:#38bdf8;background:rgba(15,23,42,0.85);border:1px solid rgba(56,189,248,0.5);border-radius:3px;pointer-events:none;white-space:nowrap;";
    badge.textContent = `🎯 ${axisName}`;
    pinHandle.appendChild(badge);

    overlay.appendChild(lineH);
    overlay.appendChild(lineV);
    overlay.appendChild(pinHandle);
    container.appendChild(overlay);

    const savedPos = getSavedCrosshairPositions()[axis] || { x: 50, y: 50 };
    let curPercentX = typeof savedPos.x === "number" ? savedPos.x : 50;
    let curPercentY = typeof savedPos.y === "number" ? savedPos.y : 50;

    function setPosition(pctX, pctY, save = true) {
      pctX = Math.max(0, Math.min(100, pctX));
      pctY = Math.max(0, Math.min(100, pctY));
      curPercentX = pctX;
      curPercentY = pctY;

      lineH.style.top = `${pctY}%`;
      lineV.style.left = `${pctX}%`;
      pinHandle.style.left = `${pctX}%`;
      pinHandle.style.top = `${pctY}%`;

      if (save) {
        saveCrosshairPosition(axis, pctX, pctY);
      }
    }

    setPosition(curPercentX, curPercentY, false);

    let isDragging = false;
    pinHandle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      pinHandle.style.cursor = "grabbing";
      pinHandle.setPointerCapture(e.pointerId);
      e.stopPropagation();
      e.preventDefault();
    });

    pinHandle.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const pctX = (px / rect.width) * 100;
      const pctY = (py / rect.height) * 100;
      setPosition(pctX, pctY, true);
      e.stopPropagation();
      e.preventDefault();
    });

    const stopDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      pinHandle.style.cursor = "grab";
      try {
        pinHandle.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };
    pinHandle.addEventListener("pointerup", stopDrag);
    pinHandle.addEventListener("pointercancel", stopDrag);

    pinHandle.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      e.preventDefault();
      setPosition(50, 50, true);
    });

    // Alt + Click bất kỳ đâu trên khung nhìn 2D để đưa ngay tâm ngắm mốc ghim tới vị trí đó
    container.addEventListener(
      "pointerdown",
      (e) => {
        if (e.altKey && e.button === 0 && isCrosshairPinEnabled()) {
          const rect = container.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const pctX = (px / rect.width) * 100;
            const pctY = (py / rect.height) * 100;
            setPosition(pctX, pctY, true);
            e.stopPropagation();
            e.preventDefault();
          }
        }
      },
      true,
    );

    container.__auto_lwh_crosshair__ = {
      overlay,
      setPosition,
      updateVisibility: () => {
        overlay.style.display = isCrosshairPinEnabled() ? "block" : "none";
      },
    };
    container.__auto_lwh_crosshair__.updateVisibility();
  }

  function updateAllCrosshairOverlays() {
    const pc = getPagePc();
    if (!pc || !Array.isArray(pc.renderViews)) return;
    pc.renderViews.forEach((view) => {
      if (view?.container?.__auto_lwh_crosshair__) {
        view.container.__auto_lwh_crosshair__.updateVisibility();
      }
    });
  }

  // =========================================================================
  // METHOD 2: BÓNG MA FRAME TRƯỚC (GHOST BOX / ONION SKINNING)
  // =========================================================================
  const GHOST_STORAGE_KEY = "auto-lwh-ghost-box-enabled";
  let ghostBoxMesh = null;
  const trackGhostHistory = new Map(); // trackId -> { frameIndex, position, quaternion, scale }
  const lastTrackActiveRecords = new Map(); // trackId -> { frameIndex, position, quaternion, scale }
  let manualLockedGhost = null; // { frameIndex, trackId, position, quaternion, scale }
  let lastInspectedTrackId = "";

  function isGhostBoxEnabled() {
    return localStorage.getItem(GHOST_STORAGE_KEY) === "true";
  }

  function setGhostBoxEnabled(enabled) {
    localStorage.setItem(GHOST_STORAGE_KEY, String(enabled));
    const panel = document.getElementById(POSITION_PANEL_ID);
    const cb = panel?.querySelector('[data-role="enable-ghost-box"]');
    if (cb) cb.checked = enabled;
    refreshGhostBox();
  }

  function toggleGhostBox() {
    setGhostBoxEnabled(!isGhostBoxEnabled());
  }

  function toggleLockGhost() {
    const panel = document.getElementById(POSITION_PANEL_ID);
    const lockBtn = panel?.querySelector('[data-role="lock-ghost-btn"]');

    if (manualLockedGhost) {
      manualLockedGhost = null;
      if (lockBtn) {
        lockBtn.textContent = "👻 Chốt Bóng";
        lockBtn.style.background = "#d97706";
      }
    } else {
      const obj = getSelectedObject();
      if (!obj || !obj.position || !obj.scale) {
        alert("Vui lòng chọn một bounding box để chốt làm bóng ma chuẩn!");
        return;
      }
      const fNum = getCurrentFrameNumber() || 1;
      const trackId = String(
        obj.userData?.trackId ?? obj.userData?.trackName ?? obj.uuid ?? "",
      );
      manualLockedGhost = {
        frameIndex: fNum,
        trackId: trackId,
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        quaternion: obj.quaternion
          ? {
              x: obj.quaternion.x,
              y: obj.quaternion.y,
              z: obj.quaternion.z,
              w: obj.quaternion.w,
            }
          : null,
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
      };
      setGhostBoxEnabled(true);
      if (lockBtn) {
        lockBtn.textContent = "🔓 Mở Chốt";
        lockBtn.style.background = "#78350f";
      }
    }
    refreshGhostBox();
  }

  function getOrCreateGhostBoxMesh(refObj) {
    if (ghostBoxMesh) return ghostBoxMesh;
    const targetObj = refObj || getSelectedObject();
    if (!targetObj) return null;

    try {
      const mesh = new targetObj.constructor();
      mesh.name = "__auto_lwh_ghost_box__";
      mesh.frustumCulled = false;
      mesh.renderOrder = 9999;
      mesh.raycast = () => {}; // Hoàn toàn xuyên thấu click chuột, không bao giờ cản trở raycaster

      if (mesh.material) {
        mesh.material = mesh.material.clone();
        mesh.material.color.setHex(0xf59e0b); // Neon Amber / Cam sáng nổi bật
        mesh.material.transparent = true;
        mesh.material.opacity = 0.6;
        mesh.material.depthTest = false;
        mesh.material.depthWrite = false;
        mesh.material.toneMapped = false;
      }
      ghostBoxMesh = mesh;
      const pc = getPagePc();
      if (pc?.scene && !ghostBoxMesh.parent) {
        pc.scene.add(ghostBoxMesh);
      }
      return ghostBoxMesh;
    } catch (err) {
      console.warn("[auto-lwh] Could not create ghost box mesh:", err);
      return null;
    }
  }

  function recordCurrentObjectState() {
    const obj = getSelectedObject();
    if (!obj || !obj.position || !obj.scale) return;
    const fNum = getCurrentFrameNumber() || 1;
    const trackId = String(
      obj.userData?.trackId ?? obj.userData?.trackName ?? obj.uuid ?? "",
    );
    if (!trackId) return;
    lastInspectedTrackId = trackId;

    const currentRecord = {
      frameIndex: fNum,
      trackId: trackId,
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      quaternion: obj.quaternion
        ? {
            x: obj.quaternion.x,
            y: obj.quaternion.y,
            z: obj.quaternion.z,
            w: obj.quaternion.w,
          }
        : null,
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
    };

    const prevRecord = lastTrackActiveRecords.get(trackId);
    if (prevRecord && prevRecord.frameIndex !== fNum) {
      trackGhostHistory.set(trackId, prevRecord);
    }
    lastTrackActiveRecords.set(trackId, currentRecord);
  }

  function applyGhostStateToMesh(state, refObj) {
    if (!state) return;
    const mesh = getOrCreateGhostBoxMesh(refObj);
    if (!mesh) return;

    if (state.position) {
      mesh.position.set(state.position.x, state.position.y, state.position.z);
    }
    if (state.quaternion) {
      mesh.quaternion.set(
        state.quaternion.x,
        state.quaternion.y,
        state.quaternion.z,
        state.quaternion.w,
      );
    }
    if (state.scale) {
      mesh.scale.set(state.scale.x, state.scale.y, state.scale.z);
    }
    mesh.updateMatrixWorld(true);
  }

  function updateGhostStatusBadge(state) {
    const panel = document.getElementById(POSITION_PANEL_ID);
    const badge = panel?.querySelector('[data-role="ghost-status-badge"]');
    if (!badge) return;

    if (!isGhostBoxEnabled()) {
      badge.textContent = "Đang tắt";
      badge.style.color = "#94a3b8";
      badge.style.background = "#263447";
      badge.title = "Bóng ma đang tắt (Phím tắt: Alt+J)";
      return;
    }

    if (manualLockedGhost) {
      badge.textContent = `Chốt: F${manualLockedGhost.frameIndex}`;
      badge.style.color = "#fde047";
      badge.style.background = "#78350f";
      badge.title = `Đang chốt chuẩn Frame ${manualLockedGhost.frameIndex} (Track #${manualLockedGhost.trackId}). Nhấn 'Mở Chốt' để về tự động.`;
      return;
    }

    if (state) {
      badge.textContent = `Bóng: F${state.frameIndex}`;
      badge.style.color = "#38bdf8";
      badge.style.background = "#1e293b";
      badge.title = `Bóng ma Frame ${state.frameIndex} của Track #${state.trackId}`;
    } else {
      badge.textContent = "Chờ đổi F";
      badge.style.color = "#94a3b8";
      badge.style.background = "#263447";
      badge.title = "Đổi frame hoặc chọn đối tượng để xem bóng ma frame trước";
    }
  }

  function refreshGhostBox() {
    const isEnabled = isGhostBoxEnabled();
    let stateToDisplay = null;

    if (isEnabled) {
      if (manualLockedGhost) {
        stateToDisplay = manualLockedGhost;
      } else {
        const obj = getSelectedObject();
        const trackId = String(
          obj?.userData?.trackId ?? obj?.userData?.trackName ?? obj?.uuid ?? lastInspectedTrackId ?? "",
        );
        if (trackId && trackGhostHistory.has(trackId)) {
          stateToDisplay = trackGhostHistory.get(trackId);
        }
      }
    }

    if (stateToDisplay) {
      applyGhostStateToMesh(stateToDisplay);
      if (ghostBoxMesh) {
        ghostBoxMesh.visible = true;
        const pc = getPagePc();
        if (pc?.scene && !ghostBoxMesh.parent) {
          pc.scene.add(ghostBoxMesh);
        }
      }
    } else {
      if (ghostBoxMesh) {
        ghostBoxMesh.visible = false;
      }
    }

    updateGhostStatusBadge(stateToDisplay);

    const pc = getPagePc();
    if (pc && Array.isArray(pc.renderViews)) {
      pc.renderViews.forEach((v) => {
        if (typeof v.render === "function") v.render();
      });
    }
    if (typeof pc?.render === "function") {
      pc.render();
    }
  }

  function setupGhostBoxRendering(view) {
    if (!view || view.__auto_lwh_ghost_hooked__ || typeof view.renderFrame !== "function") return;
    view.__auto_lwh_ghost_hooked__ = true;

    const originalRenderFrame = view.renderFrame.bind(view);
    view.renderFrame = function () {
      originalRenderFrame();
      if (isGhostBoxEnabled() && ghostBoxMesh && ghostBoxMesh.visible) {
        try {
          if (this.renderer && this.camera) {
            ghostBoxMesh.updateMatrixWorld(true);
            this.renderer.render(ghostBoxMesh, this.camera);
          }
        } catch (_) {}
      }
    };
  }

  function setupSideViewZoomLock() {
    const pc = getPagePc();
    if (!pc || !Array.isArray(pc.renderViews)) return;

    const sideViews = pc.renderViews.filter(
      (view) =>
        view &&
        typeof view.fitObject === "function" &&
        view.camera &&
        view.camera.isOrthographicCamera &&
        view.axis !== undefined,
    );

    sideViews.forEach((view) => {
      setupCrosshairOverlay(view);
      setupGhostBoxRendering(view);

      if (view.__auto_lwh_stabilized__) return;
      view.__auto_lwh_stabilized__ = true;

      let internalZoom = view.zoom || 1;
      let allowReset = false;

      // Khi người dùng double-click vào khung nhìn side view: reset cả zoom, pan và góc xoay về mặc định
      if (view.container) {
        view.container.addEventListener(
          "dblclick",
          () => {
            allowReset = true;
            view.__force_heading_reset__ = true;
            view.__force_center_reset__ = true;
            view.__pan_x__ = 0;
            view.__pan_y__ = 0;
            internalZoom = 1;
            view.zoom = 1;
            if (typeof view.fitObject === "function" && view.object) {
              view.fitObject(view.object);
            }
            if (typeof view.render === "function") {
              view.render();
            }
            setTimeout(() => {
              allowReset = false;
              view.__force_heading_reset__ = false;
              view.__force_center_reset__ = false;
            }, 200);
          },
          true,
        );
      }

      // --- 1. Khóa Zoom (Preserve Zoom) ---
      Object.defineProperty(view, "zoom", {
        configurable: true,
        enumerable: true,
        get() {
          return internalZoom;
        },
        set(newVal) {
          const panel = document.getElementById(POSITION_PANEL_ID);
          const isLockZoomEnabled =
            panel?.querySelector('[data-role="lock-side-zoom"]')?.checked ??
            localStorage.getItem("auto-lwh-lock-side-zoom") !== "false";

          // Nếu bật khóa zoom, và hệ thống cố reset zoom về 1 khi SELECT / chuyển frame
          // trong khi annotator đang zoom ở mức khác 1 và không phải do double-click:
          if (
            isLockZoomEnabled &&
            newVal === 1 &&
            internalZoom !== 1 &&
            !allowReset
          ) {
            return;
          }

          internalZoom = newVal;
        },
      });

      // --- 2. Khóa Xoay Camera & Bảo toàn Vị trí Pan (Tránh nhảy về tâm khung khi chuyển frame) ---
      const originalFitObject = view.fitObject.bind(view);

      view.fitObject = function (targetObj) {
        if (targetObj) this.object = targetObj;
        const obj = this.object;
        if (!obj) return;

        const panel = document.getElementById(POSITION_PANEL_ID);
        const isLockZoomEnabled =
          panel?.querySelector('[data-role="lock-side-zoom"]')?.checked ??
          localStorage.getItem("auto-lwh-lock-side-zoom") !== "false";
        const isLockRotEnabled =
          panel?.querySelector('[data-role="lock-side-rotation"]')?.checked ??
          localStorage.getItem("auto-lwh-lock-side-rotation") === "true";

        const currentTrackId = String(
          obj.userData?.trackId ?? obj.userData?.trackName ?? obj.uuid ?? "",
        );
        const isSameTrack =
          Boolean(this.__last_track_id__) &&
          this.__last_track_id__ === currentTrackId;
        const isSameAxis = this.__last_axis__ === this.axis;

        const Vector3 = this.camera.position.constructor;
        const Matrix4 = this.camera.matrixWorld.constructor;

        // Trích xuất pan offset của annotator từ frame trước trước khi camera bị ghi đè vị trí
        if (
          isLockZoomEnabled &&
          isSameTrack &&
          isSameAxis &&
          !allowReset &&
          !this.__force_center_reset__ &&
          this.__nominal_pos__ &&
          this.__cam_right__ &&
          this.__cam_up__
        ) {
          const diff = new Vector3()
            .copy(this.camera.position)
            .sub(this.__nominal_pos__);
          const px = diff.dot(this.__cam_right__);
          const py = diff.dot(this.__cam_up__);
          this.__pan_x__ = Number.isFinite(px) ? px : 0;
          this.__pan_y__ = Number.isFinite(py) ? py : 0;
        } else if (
          !isSameTrack ||
          !isSameAxis ||
          allowReset ||
          this.__force_center_reset__ ||
          !isLockZoomEnabled
        ) {
          this.__pan_x__ = 0;
          this.__pan_y__ = 0;
        }

        // Căn chỉnh vị trí danh nghĩa (nominal) và góc xoay
        if (!isLockRotEnabled) {
          this.__locked_track_id__ = currentTrackId;
          this.__locked_quaternion__ = null;
          originalFitObject(obj);
        } else {
          // Nếu đổi sang track khác hoặc chưa có quaternion khóa hoặc được lệnh reset:
          if (
            !this.__locked_quaternion__ ||
            this.__locked_track_id__ !== currentTrackId ||
            this.__force_heading_reset__
          ) {
            this.__locked_quaternion__ = obj.quaternion
              ? obj.quaternion.clone()
              : null;
            this.__locked_track_id__ = currentTrackId;
            this.__force_heading_reset__ = false;
          }

          if (!this.__locked_quaternion__) {
            originalFitObject(obj);
          } else {
            obj.updateMatrixWorld();

            const lockedMatrix = new Matrix4();
            lockedMatrix.compose(
              obj.position,
              this.__locked_quaternion__,
              obj.scale,
            );

            // Đặt vị trí camera
            const temp = new Vector3();
            temp.copy(this.alignAxis);
            temp.applyMatrix4(lockedMatrix);
            this.camera.position.copy(temp);

            // Đặt trục Up của camera
            const upDirMap = {
              x: [0, 0, 1],
              "-x": [0, 0, 1],
              z: [1, 0, 0],
              y: [0, 0, 1],
              "-y": [0, 0, 1],
            };
            const dirCoord = upDirMap[this.axis] || [0, 0, 1];
            const dirVec = new Vector3(dirCoord[0], dirCoord[1], dirCoord[2]);

            const zeroVec = new Vector3().applyMatrix4(lockedMatrix);
            temp.copy(dirVec).applyMatrix4(lockedMatrix).sub(zeroVec);
            this.camera.up.copy(temp);

            // Camera nhìn vào tâm của box
            temp.set(0, 0, 0);
            temp.applyMatrix4(lockedMatrix);
            this.camera.lookAt(temp);

            // Cập nhật project rect và camera bounds
            if (typeof this.updateProjectRect === "function") {
              this.updateProjectRect();
            }
            if (typeof this.updateCameraProject === "function") {
              this.updateCameraProject();
            }
          }
        }

        // Lưu lại nominal position và các trục camera cho frame mới
        const newNominalPos = this.camera.position.clone();
        this.camera.updateMatrixWorld();
        const camRight = new Vector3(1, 0, 0).applyQuaternion(
          this.camera.quaternion,
        );
        const camUp = new Vector3(0, 1, 0).applyQuaternion(
          this.camera.quaternion,
        );

        this.__nominal_pos__ = newNominalPos;
        this.__cam_right__ = camRight;
        this.__cam_up__ = camUp;
        this.__last_track_id__ = currentTrackId;
        this.__last_axis__ = this.axis;

        // Tái áp dụng Pan Offset nếu đang bật Khóa Zoom 2D
        if (
          isLockZoomEnabled &&
          (Math.abs(this.__pan_x__ || 0) > 1e-4 ||
            Math.abs(this.__pan_y__ || 0) > 1e-4)
        ) {
          const panOffset = camRight
            .clone()
            .multiplyScalar(this.__pan_x__)
            .add(camUp.clone().multiplyScalar(this.__pan_y__));
          this.camera.position.add(panOffset);
          this.camera.updateMatrixWorld();
          if (typeof this.render === "function") {
            this.render();
          }
        }
      };
    });
  }

  function init() {
    ensurePositionPanel();
    setupSideViewZoomLock();
    updatePositionPanel();

    const refreshSelection = () => {
      if (isPositionPanelEditing()) return;

      const autoSnap =
        localStorage.getItem("auto-lwh-auto-snap-ground") === "true";
      if (autoSnap) {
        const obj = getSelectedObject();
        if (obj) snapObjectToGround(obj);
      }

      const autoRefZ =
        localStorage.getItem("auto-lwh-auto-ref-z") === "true";
      if (autoRefZ) {
        checkAutoApplyRefZ();
      }

      recordCurrentObjectState();
      refreshGhostBox();

      requestAnimationFrame(() => updatePositionPanel());
      setTimeout(() => updatePositionPanel(), 60);
    };

    // Phím tắt Alt+G để lập tức hạ sát mặt đất, Alt+Z tính Z theo ID
    window.addEventListener(
      "keydown",
      (e) => {
        if (isPositionPanelEditing()) return;
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea") return;

        if (e.altKey && (e.key === "b" || e.key === "B")) {
          e.preventDefault();
          e.stopPropagation();
          spawnConeB();
        }
        if (e.altKey && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          e.stopPropagation();
          const obj = getSelectedObject();
          if (obj) applyRefZ(obj);
        }
        if (e.altKey && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          e.stopPropagation();
          const obj = getSelectedObject();
          if (obj) snapObjectSignboard(obj);
        }
        if (e.altKey && (e.key === "o" || e.key === "O")) {
          e.preventDefault();
          e.stopPropagation();
          const obj = getSelectedObject();
          if (obj) snapObjectOverhead(obj);
        }
        if (e.altKey && (e.key === "f" || e.key === "F")) {
          e.preventDefault();
          e.stopPropagation();
          const obj = getSelectedObject();
          if (obj) snapObjectAll(obj);
        }
        if (e.altKey && (e.key === "g" || e.key === "G")) {
          e.preventDefault();
          e.stopPropagation();
          const obj = getSelectedObject();
          if (obj) snapObjectToGround(obj);
        }
        if (e.altKey && (e.key === "m" || e.key === "M")) {
          e.preventDefault();
          e.stopPropagation();
          toggleCrosshairPin();
        }
        if (e.altKey && (e.key === "j" || e.key === "J")) {
          e.preventDefault();
          e.stopPropagation();
          toggleGhostBox();
        }

        // Phím tắt Numpad điều chỉnh Position (bước nhảy 0.01m, Yaw 0.5°)
        const isNumpad =
          e.location === 3 ||
          (typeof e.code === "string" && e.code.startsWith("Numpad"));

        if (isNumpad) {
          if (e.code === "Numpad8" || e.key === "8" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            nudgeSelectedPosition({ dy: 0.01 });
          } else if (e.code === "Numpad2" || e.key === "2" || e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            nudgeSelectedPosition({ dy: -0.01 });
          } else if (e.code === "Numpad4" || e.key === "4" || e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            nudgeSelectedPosition({ dx: -0.01 });
          } else if (e.code === "Numpad6" || e.key === "6" || e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            nudgeSelectedPosition({ dx: 0.01 });
          } else if (e.code === "Numpad9" || e.key === "9" || e.key === "PageUp") {
            e.preventDefault();
            e.stopPropagation();
            nudgeSelectedPosition({ dz: 0.01 });
          } else if (e.code === "Numpad3" || e.key === "3" || e.key === "PageDown") {
            e.preventDefault();
            e.stopPropagation();
            nudgeSelectedPosition({ dz: -0.01 });
          } else if (e.code === "Numpad7" || e.key === "7" || e.key === "Home") {
            e.preventDefault();
            e.stopPropagation();
            nudgeSelectedPosition({ dYaw: -0.5 });
          } else if (e.code === "Numpad1" || e.key === "1" || e.key === "End") {
            e.preventDefault();
            e.stopPropagation();
            nudgeSelectedPosition({ dYaw: 0.5 });
          }
        }
      },
      true,
    );

    window.addEventListener("focus", refreshSelection);
    window.addEventListener("mouseup", refreshSelection);
    window.addEventListener("pointerup", refreshSelection);
    window.addEventListener("touchend", refreshSelection);
    window.addEventListener("keyup", refreshSelection);

    // Tự động nhả focus khi click ra ngoài bảng điều khiển về trang web
    window.addEventListener(
      "pointerdown",
      (event) => {
        const panel = document.getElementById(POSITION_PANEL_ID);
        if (!panel) return;
        const active = document.activeElement;
        if (
          active &&
          panel.contains(active) &&
          (active.tagName === "INPUT" || active.tagName === "SELECT")
        ) {
          if (!panel.contains(event.target)) {
            active.blur();
          }
        }
      },
      true,
    );

    const panel = document.getElementById(POSITION_PANEL_ID);
    if (panel) {
      panel.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", () => {
          const role = input.dataset?.role;
          if (["x", "y", "z"].includes(role)) {
            applySelectedPosition();
          }
          if (["l", "w", "h"].includes(role)) {
            applySelectedLwh(role);
          }
          if (role === "yaw") {
            applySelectedYaw();
          }
        });
      });
    }

    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;
    const handleFrameSwitch = () => {
      if (isBatchSyncRunning) return;
      recordCurrentObjectState();
      refreshGhostBox();
      refreshSelection();
      // Tuyệt đối không âm thầm tự động căn chỉnh: Chỉ chạy khi người dùng trực tiếp tích chọn checkbox trên giao diện
      const autoSpawn =
        Boolean(document.getElementById(POSITION_PANEL_ID)?.querySelector('[data-role="auto-spawn-cone"]')?.checked);
      if (autoSpawn) {
        setTimeout(() => {
          if (isBatchSyncRunning) return;
          const ok = spawnConeB();
          if (!ok) {
            setTimeout(() => {
              if (isBatchSyncRunning) return;
              spawnConeB();
            }, 250);
          }
        }, 120);
      }
    };
    editor?.addEventListener?.("frameChange", handleFrameSwitch);
    editor?.addEventListener?.("FRAME_CHANGE", handleFrameSwitch);

    if (editor && typeof editor.loadFrame === "function" && !editor.__origLoadFrame) {
      editor.__origLoadFrame = editor.loadFrame;
      editor.loadFrame = function (...args) {
        recordCurrentObjectState();
        const res = editor.__origLoadFrame.apply(this, args);
        setTimeout(handleFrameSwitch, 120);
        return res;
      };
    }

    const pc = getPagePc();
    pc?.addEventListener?.("SELECT", refreshSelection);
    pc?.addEventListener?.("OBJECT_TRANSFORM", refreshSelection);
    pc?.addEventListener?.("select", refreshSelection);
    pc?.addEventListener?.("objectTransform", refreshSelection);
    pc?.addEventListener?.("dragend", refreshSelection);
    pc?.addEventListener?.("pointerup", refreshSelection);
    pc?.addEventListener?.("mouseup", refreshSelection);

    let lastDetectedFrameIndex = null;
    const syncTimer = setInterval(() => {
      setupSideViewZoomLock();
      recordCurrentObjectState();
      refreshGhostBox();

      const curFIdx = editor?.state?.frameIndex;
      if (typeof curFIdx === "number" && curFIdx !== lastDetectedFrameIndex) {
        lastDetectedFrameIndex = curFIdx;
        handleFrameSwitch();
      }

      if (isPositionPanelEditing()) return;

      const obj = getSelectedObject();
      if (!obj) return;

      const nextValue = {
        x: obj.position ? Number(obj.position.x || 0).toFixed(2) : "0.00",
        y: obj.position ? Number(obj.position.y || 0).toFixed(2) : "0.00",
        z: obj.position ? Number(obj.position.z || 0).toFixed(2) : "0.00",
        l: obj.scale ? Number(obj.scale.x || 0).toFixed(2) : "0.00",
        w: obj.scale ? Number(obj.scale.y || 0).toFixed(2) : "0.00",
        h: obj.scale ? Number(obj.scale.z || 0).toFixed(2) : "0.00",
      };

      const panel = document.getElementById(POSITION_PANEL_ID);
      if (!panel) return;

      const xInput = panel.querySelector('[data-role="x"]');
      const yInput = panel.querySelector('[data-role="y"]');
      const zInput = panel.querySelector('[data-role="z"]');
      const lInput = panel.querySelector('[data-role="l"]');
      const wInput = panel.querySelector('[data-role="w"]');
      const hInput = panel.querySelector('[data-role="h"]');

      const currentValue = {
        x: xInput?.value ?? "",
        y: yInput?.value ?? "",
        z: zInput?.value ?? "",
        l: lInput?.value ?? "",
        w: wInput?.value ?? "",
        h: hInput?.value ?? "",
      };

      if (
        currentValue.x !== nextValue.x ||
        currentValue.y !== nextValue.y ||
        currentValue.z !== nextValue.z ||
        currentValue.l !== nextValue.l ||
        currentValue.w !== nextValue.w ||
        currentValue.h !== nextValue.h
      ) {
        updatePositionPanel();
      }
    }, 250);

    window.__AUTO_LWH_SYNC_TIMER__ = syncTimer;

    setTimeout(() => {
      setLwh();
      updatePositionPanel();
    }, 1200);
  }

  if (document.readyState === "complete") {
    init();
  } else {
    const timer = setInterval(() => {
      if (document.readyState === "complete") {
        init();
        clearInterval(timer);
      }
    }, 300);
  }
})();
