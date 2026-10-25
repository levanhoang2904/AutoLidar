(function () {
  const POSITION_PANEL_ID = "auto-lwh-position-panel";
  const DEFAULT_SIZE = { x: 2.5, y: 1.8, z: 1.2 };
  const ALLOWED_ORIGINS = ["http://localhost:8190", "http://127.0.0.1:8190"];

  if (!ALLOWED_ORIGINS.includes(location.origin)) return;

  function getPagePc() {
    return (
      window.editor?.pc || window.__APP__?.editor?.pc || window.app?.pc || null
    );
  }

  function getCurrentFrameNumber() {
    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;
    if (editor && editor.state && typeof editor.state.frameIndex === "number") {
      return editor.state.frameIndex + 1;
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

  function persistEditorState() {
    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;
    if (editor && typeof editor.save === "function") {
      try {
        editor.save();
      } catch (error) {
        console.warn("editor.save() failed:", error);
      }
    }

    const app = window.__APP__ || window.app;
    if (app && typeof app.save === "function") {
      try {
        app.save();
      } catch (error) {
        console.warn("app.save() failed:", error);
      }
    }
  }

  function applyObjectTransform(obj, payload) {
    if (!obj) return false;

    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;
    const pc = getPagePc();

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
        obj.position.copy(payload.position);
      }
      if (obj.scale && payload && payload.scale) {
        obj.scale.copy(payload.scale);
      }
      if (obj.rotation && payload && payload.rotation) {
        obj.rotation.copy(payload.rotation);
      }
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
        if (roadRingZ.length >= 3) { // Thích ứng cả khi ít điểm (Sparse)
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
        if (tireContactZ.length >= 2) { // Thích ứng cả khi ít điểm (Sparse)
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
            (-plane.constant - plane.normal.x * targetX - plane.normal.y * targetY) / nz;
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
      const editor = window.editor || window.__APP__?.editor || window.app?.editor;
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
    const offsetInput = panel?.querySelector('[data-role="ground-offset-input"]');
    const offset =
      typeof customOffset === "number"
        ? customOffset
        : offsetInput && Number.isFinite(parseFloat(offsetInput.value))
          ? parseFloat(offsetInput.value)
          : getSavedGroundOffset();

    const halfH = (obj.scale.z || 1.5) / 2;
    const curBottomZ = obj.position.z - halfH;

    const detected = detectGroundZ(
      obj.position.x,
      obj.position.y,
      curBottomZ,
      obj.scale.x,
      obj.scale.y
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

    const newCenterZ = detected.groundZ + halfH + offset;

    applyObjectTransform(obj, {
      position: {
        x: obj.position.x,
        y: obj.position.y,
        z: newCenterZ,
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

      // 1. Thu thập điểm LiDAR trong phạm vi box (kèm lề 0.45m)
      const cand = [];
      const step = count > 120000 ? 2 : 1;
      for (let i = 0; i < count; i += step) {
        const idx = i * 3;
        const px = arr[idx];
        const py = arr[idx + 1];
        const pz = arr[idx + 2];

        // Lọc cao độ Z trong khoảng thân xe
        if (Math.abs(pz - boxZ) > halfH + 0.3) continue;

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

      // 2. Tách điểm sườn (Side) và điểm đuôi/đầu (Bumper)
      const marginX = isSparse ? halfL - 0.15 : halfL - 0.25;
      const leftSide = cand.filter((p) => p.ly > 0.15 && Math.abs(p.lx) < marginX);
      const rightSide = cand.filter((p) => p.ly < -0.15 && Math.abs(p.lx) < marginX);

      let dominantSide = null;
      if (leftSide.length > 0 || rightSide.length > 0) {
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
      if (dominantSide) {
        const sidePts = dominantSide === "left" ? leftSide : rightSide;
        if (sidePts.length >= 4) {
          // Chế độ nhiều điểm: Lọc phân vị 5% / 95% để chống nhiễu hạt bụi tuyệt đối
          const sortedY = sidePts.map((p) => p.ly).sort((a, b) => a - b);
          if (dominantSide === "left") {
            const yEdge = sortedY[Math.floor(sortedY.length * 0.95)];
            deltaY = yEdge - halfW;
          } else {
            const yEdge = sortedY[Math.floor(sortedY.length * 0.05)];
            deltaY = yEdge - -halfW;
          }
        } else if (sidePts.length >= 1) {
          // Chế độ ít điểm (Sparse): Bắt thẳng vào điểm ngoài cùng
          const sortedY = sidePts.map((p) => p.ly).sort((a, b) => a - b);
          if (dominantSide === "left") {
            const yEdge = sortedY[sortedY.length - 1]; // Lớn nhất bên trái
            deltaY = yEdge - halfW;
          } else {
            const yEdge = sortedY[0]; // Nhỏ nhất (âm nhất) bên phải
            deltaY = yEdge - -halfW;
          }
        }
      }

      // 4. Căn mép đuôi / đầu (Longitudinal shift: deltaX)
      const rearMarginY = isSparse ? halfW - 0.10 : halfW - 0.15;
      const rearPts = cand.filter(
        (p) => p.lx < -0.2 && Math.abs(p.ly) < rearMarginY
      );
      const frontPts = cand.filter(
        (p) => p.lx > 0.2 && Math.abs(p.ly) < rearMarginY
      );

      let deltaX = 0;
      if (rearPts.length >= 4 && rearPts.length > frontPts.length * 1.3) {
        const sortedX = rearPts.map((p) => p.lx).sort((a, b) => a - b);
        const xEdge = sortedX[Math.floor(sortedX.length * 0.05)];
        deltaX = xEdge - -halfL;
      } else if (frontPts.length >= 4 && frontPts.length > rearPts.length * 1.3) {
        const sortedX = frontPts.map((p) => p.lx).sort((a, b) => a - b);
        const xEdge = sortedX[Math.floor(sortedX.length * 0.95)];
        deltaX = xEdge - halfL;
      } else if (rearPts.length >= 3 && frontPts.length >= 3) {
        const sortedRear = rearPts.map((p) => p.lx).sort((a, b) => a - b);
        const sortedFront = frontPts.map((p) => p.lx).sort((a, b) => a - b);
        const rEdge = sortedRear[Math.floor(sortedRear.length * 0.05)];
        const fEdge = sortedFront[Math.floor(sortedFront.length * 0.95)];
        deltaX = (rEdge + halfL + (fEdge - halfL)) / 2;
      } else if (rearPts.length >= 1) {
        // Chế độ ít điểm (Sparse): Bắt đuôi xe theo điểm rearmost
        const sortedX = rearPts.map((p) => p.lx).sort((a, b) => a - b);
        const xEdge = sortedX[0];
        deltaX = xEdge - -halfL;
      } else if (frontPts.length >= 1) {
        // Chế độ ít điểm (Sparse): Bắt đầu xe theo điểm frontmost
        const sortedX = frontPts.map((p) => p.lx).sort((a, b) => a - b);
        const xEdge = sortedX[sortedX.length - 1];
        deltaX = xEdge - halfL;
      }

      // Giới hạn dịch chuyển tối đa thích ứng:
      // Khi ít điểm (xe ở xa), siết chặt biên độ tối đa (35cm/30cm) để dù có 1 điểm bay lạc cũng không giật box đi xa
      const maxShiftX = isSparse ? 0.35 : 0.75;
      const maxShiftY = isSparse ? 0.30 : 0.55;

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
        const sideDetail = dominantSide
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

function ensurePositionPanel() {
    let panel = document.getElementById(POSITION_PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = POSITION_PANEL_ID;
    panel.style.position = "fixed";
    panel.style.left = "16px";
    panel.style.top = "16px";
    panel.style.zIndex = "999999";
    panel.style.width = "300px";
    panel.style.padding = "12px 14px";
    panel.style.borderRadius = "10px";
    panel.style.background = "rgba(20, 24, 30, 0.95)";
    panel.style.border = "1px solid rgba(255,255,255,0.1)";
    panel.style.boxShadow = "0 10px 25px rgba(0,0,0,0.25)";
    panel.style.color = "#f5f5f5";
    panel.style.fontFamily = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
    panel.style.fontSize = "12px";
    panel.style.fontWeight = "500";
    panel.style.lineHeight = "1.4";
    panel.style.userSelect = "none";

    panel.innerHTML = `
      <style>
        #${POSITION_PANEL_ID} input[type="number"] {
          outline: none;
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        #${POSITION_PANEL_ID} input[type="number"]:focus {
          border-color: #60a5fa !important;
          box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.18);
          background: #172033 !important;
        }
        #${POSITION_PANEL_ID} input[type="checkbox"] {
          appearance: none;
          width: 18px;
          height: 18px;
          margin: 0;
          border: 1px solid #64748b;
          border-radius: 5px;
          background: #111827;
          cursor: pointer;
          flex: 0 0 18px;
          display: grid;
          place-content: center;
          transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }
        #${POSITION_PANEL_ID} input[type="checkbox"]::before {
          content: "";
          width: 9px;
          height: 5px;
          border-left: 2px solid white;
          border-bottom: 2px solid white;
          transform: rotate(-45deg) scale(0);
          transition: transform 0.12s ease;
        }
        #${POSITION_PANEL_ID} input[type="checkbox"]:checked {
          border-color: #60a5fa;
          background: #2563eb;
        }
        #${POSITION_PANEL_ID} input[type="checkbox"]:checked::before {
          transform: rotate(-45deg) scale(1);
        }
        #${POSITION_PANEL_ID} button {
          font-family: inherit;
          font-weight: 700;
          transition: filter 0.15s ease, transform 0.08s ease;
        }
        #${POSITION_PANEL_ID} button:hover {
          filter: brightness(1.12);
        }
        #${POSITION_PANEL_ID} button:active {
          transform: translateY(1px);
        }
        #${POSITION_PANEL_ID} [data-role="tab-button"] {
          flex: 1;
          height: 30px;
          border: 1px solid #3b4655;
          border-radius: 6px;
          background: #171e29;
          color: #b8c5da;
          cursor: pointer;
        }
        #${POSITION_PANEL_ID} [data-role="tab-button"][data-active="true"] {
          border-color: #60a5fa;
          background: #1d4ed8;
          color: white;
        }
        #${POSITION_PANEL_ID} [data-role="auto-fit-pane"] {
          min-height: 120px;
        }
        #${POSITION_PANEL_ID} [data-role="keyframe-card"] {
          padding: 8px;
          border: 1px solid #334155;
          border-radius: 8px;
          background: #151d2a;
        }
        #${POSITION_PANEL_ID} [data-role="keyframe-card"] input[readonly] {
          height: 31px;
          text-align: center;
          font-size: 12px;
        }
        #${POSITION_PANEL_ID} [data-role="auto-fit-pane"] button {
          letter-spacing: 0;
        }
      </style>
      <div data-role="drag-header" style="display:flex;align-items:center;justify-content:space-between;cursor:move;margin-bottom:6px;padding:2px 0;font-weight:700;font-size:13px;">
        <span>Selection Transform</span>
        <button data-role="panel-collapse" title="Thu nhỏ panel" style="width:26px;height:24px;padding:0;border:none;border-radius:5px;background:#374151;color:white;cursor:pointer;font-size:16px;">−</button>
      </div>
      <div data-role="class-name" style="margin-bottom:8px;padding:6px 8px;border:1px solid #3b4655;border-radius:6px;background:#171e29;color:#93c5fd;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Class: No selection</div>
      <div data-role="panel-content">
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        <button data-role="tab-button" data-tab="transform" data-active="true">Transform</button>
        <button data-role="tab-button" data-tab="auto-fit" data-active="false">Auto Fit</button>
      </div>
      <div data-role="transform-pane">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#dbe4ff;">
          X
          <input data-role="x" type="number" step="0.01" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#dbe4ff;">
          Y
          <input data-role="y" type="number" step="0.01" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#dbe4ff;">
          Z
          <input data-role="z" type="number" step="0.01" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#dbe4ff;">
          L
          <input data-role="l" type="number" step="0.01" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#dbe4ff;">
          W
          <input data-role="w" type="number" step="0.01" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:#dbe4ff;">
          H
          <input data-role="h" type="number" step="0.01" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #3d4755;background:#111827;color:white;box-sizing:border-box;" />
        </label>
      </div>
      <div data-role="overhead-alignment-card" style="margin-bottom:10px;padding:9px 10px;border:1px solid #10b981;border-radius:8px;background:rgba(16, 185, 129, 0.12);box-shadow:inset 0 0 10px rgba(16, 185, 129, 0.08);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
          <span style="font-weight:700;font-size:11px;color:#34d399;">🎯 CĂN OVERHEAD (L-SHAPE)</span>
          <span data-role="overhead-fit-badge" style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:#334155;color:#94a3b8;">Sẵn sàng</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button data-role="snap-overhead-btn" title="Tự động hút khít sườn và đuôi xe (Phím tắt: Alt+O)" style="flex:1;height:32px;display:flex;align-items:center;justify-content:center;gap:4px;border:none;border-radius:6px;background:#059669;color:white;cursor:pointer;font-size:11px;font-weight:800;letter-spacing:0.2px;">
            <span>🎯 Snap Sườn & Đuôi</span>
            <span style="font-size:10px;opacity:0.85;font-weight:600;">(Alt+O)</span>
          </button>
          <button data-role="snap-all-btn" title="Căn chỉnh toàn diện: Hút sườn/đuôi và hạ sát mặt đường (Phím tắt: Alt+F)" style="flex:0 0 82px;height:32px;display:flex;align-items:center;justify-content:center;gap:3px;border:none;border-radius:6px;background:#7c3aed;color:white;cursor:pointer;font-size:10px;font-weight:800;">
            <span>⚡ All (Alt+F)</span>
          </button>
        </div>
      </div>
        
      <div data-role="ground-alignment-card" style="margin-bottom:11px;padding:9px 10px;border:1px solid #0284c7;border-radius:8px;background:rgba(14, 116, 144, 0.15);box-shadow:inset 0 0 10px rgba(2, 132, 199, 0.1);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
          <span style="font-weight:700;font-size:11px;color:#38bdf8;">🚗 CĂN CHỈNH MẶT ĐƯỜNG</span>
          <span data-role="ground-diff-badge" style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:#334155;color:#94a3b8;">Đang đo...</span>
        </div>
        <button data-role="snap-ground-btn" title="Hạ đáy bounding box tiếp xúc chuẩn xác vào mặt đường nhựa (Phím tắt: Alt+G)" style="width:100%;height:32px;display:flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:6px;background:#0284c7;color:white;cursor:pointer;font-size:11px;font-weight:800;letter-spacing:0.2px;">
          <span>⬇️ Hạ Sát Mặt Đường</span>
          <span style="font-size:10px;opacity:0.85;font-weight:600;">(Alt+G)</span>
        </button>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:7px;font-size:10px;color:#bae6fd;">
          <span>Bù đáy (Offset):</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <button data-role="offset-preset" data-offset="-0.05" style="padding:2px 5px;border:1px solid #0369a1;border-radius:4px;background:#0c4a6e;color:#e0f2fe;font-size:9px;font-weight:700;cursor:pointer;">-5cm</button>
            <button data-role="offset-preset" data-offset="0" style="padding:2px 5px;border:1px solid #0369a1;border-radius:4px;background:#0c4a6e;color:#e0f2fe;font-size:9px;font-weight:700;cursor:pointer;">0cm</button>
            <button data-role="offset-preset" data-offset="0.05" style="padding:2px 5px;border:1px solid #0369a1;border-radius:4px;background:#0c4a6e;color:#e0f2fe;font-size:9px;font-weight:700;cursor:pointer;">+5cm</button>
            <input data-role="ground-offset-input" type="number" step="0.01" value="0.00" style="width:48px;padding:2px 4px;border:1px solid #0284c7;border-radius:4px;background:#082f49;color:white;text-align:center;font-size:10px;font-weight:700;" />
            <span>m</span>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:7px;margin-top:7px;font-size:10px;color:#bae6fd;cursor:pointer;">
          <input data-role="auto-snap-ground" type="checkbox" style="width:15px;height:15px;flex:0 0 15px;" />
          <span>Tự động bám mặt đường khi chuyển frame</span>
        </label>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;font-size:12px;color:#e5edff;">
        <label style="display:flex;align-items:center;gap:8px;min-height:28px;padding:4px 7px;border:1px solid #3b4655;border-radius:6px;background:#171e29;cursor:pointer;">
          <input data-role="sync-wh" type="checkbox" />
          <span>Đồng bộ W H</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;min-height:28px;padding:4px 7px;border:1px solid #3b4655;border-radius:6px;background:#171e29;cursor:pointer;">
          <input data-role="sync-lw" type="checkbox" />
          <span>Đồng bộ L W</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;min-height:28px;padding:4px 7px;border:1px solid #3b4655;border-radius:6px;background:#171e29;cursor:pointer;" title="Giữ nguyên mức phóng to (zoom) của 3 khung nhìn Overhead/Side/Rear khi chuyển frame thay vì bị giật về mặc định">
          <input data-role="lock-side-zoom" type="checkbox" />
          <span style="color:#93c5fd;">Khóa Zoom Side Views</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;min-height:28px;padding:4px 7px;border:1px solid #3b4655;border-radius:6px;background:#171e29;cursor:pointer;" title="Khóa góc xoay camera ở 3 khung nhìn Overhead/Side/Rear cố định theo track, không bị xoay lộn nhào khi xe chuyển làn hoặc AI lật ngược đầu">
          <input data-role="lock-side-rotation" type="checkbox" />
          <span style="color:#a78bfa;">Khóa Xoay Side Views</span>
        </label>
      </div>
      <div style="display:flex;gap:8px;">
        <button data-role="signal" style="flex:1;padding:7px 10px;border:none;border-radius:6px;background:#e74c3c;color:white;cursor:pointer;">Biển báo</button>
        <button data-role="cone" style="flex:1;padding:7px 10px;border:none;border-radius:6px;background:#9b59b6;color:white;cursor:pointer;">Cone</button>
      </div>
      </div>
      <div data-role="auto-fit-pane" style="display:none;padding:9px;border:1px solid #3b4655;border-radius:6px;background:#171e29;">
        <div style="font-size:12px;font-weight:700;margin-bottom:9px;color:#e5edff;">Nội suy XYZ giữa 2 frame</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:9px;">
          <label style="font-size:10px;color:#dbe4ff;">Frame bắt đầu
            <input data-role="frame-start-index" type="number" step="1" placeholder="A" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#111827;color:white;font-family:inherit;" />
          </label>
          <label style="font-size:10px;color:#dbe4ff;">Frame hiện tại
            <input data-role="frame-current-index" type="number" step="1" placeholder="N" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#111827;color:white;font-family:inherit;" />
          </label>
          <label style="font-size:10px;color:#dbe4ff;">Frame kết thúc
            <input data-role="frame-end-index" type="number" step="1" placeholder="B" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#111827;color:white;font-family:inherit;" />
          </label>
        </div>
        <div data-role="keyframe-card" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;"><strong style="font-size:11px;color:#93c5fd;">FRAME A</strong><button data-role="copy-frame-a" title="Chốt frame hiện tại làm Frame A và ghi nhận tọa độ XYZ" style="height:24px;padding:0 8px;border:none;border-radius:5px;background:#2563eb;color:white;cursor:pointer;font-size:10px;font-weight:700;">Chốt Frame A</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
          <label style="font-size:10px;color:#dbe4ff;">X
            <input data-role="frame-a-x" type="number" step="0.01" readonly placeholder="X" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
          </label>
          <label style="font-size:10px;color:#dbe4ff;">Y
            <input data-role="frame-a-y" type="number" step="0.01" readonly placeholder="Y" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
          </label>
          <label style="font-size:10px;color:#dbe4ff;">Z
            <input data-role="frame-a-z" type="number" step="0.01" readonly placeholder="Z" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
          </label>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:7px;margin-bottom:9px;">
          <label style="font-size:10px;color:#dbe4ff;">Chế độ chuyển động
            <select data-role="frame-interpolation-mode" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#111827;color:white;font-family:inherit;font-size:11px;">
              <option value="linear">Đi đều (Linear)</option>
              <option value="ease-out">🚗🛑 Phanh chậm dần (Ease-Out)</option>
              <option value="ease-in">🚗💨 Tăng tốc (Ease-In)</option>
              <option value="ease-in-out">〰️ S-Curve (Chuyển nhịp)</option>
              <option value="quadratic">📐 Tự do 3 điểm A-M-B</option>
            </select>
          </label>
          <label data-role="frame-m-input-wrapper" style="font-size:10px;color:#dbe4ff;transition:opacity 0.2s;">Frame M
            <input data-role="frame-middle-index" type="number" step="1" placeholder="M" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#111827;color:white;font-family:inherit;" />
          </label>
        </div>
        <div data-role="keyframe-card-m" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;padding:8px;border:1px solid #334155;border-radius:8px;background:#151d2a;transition:opacity 0.2s;">
          <div style="display:flex;align-items:center;justify-content:space-between;"><strong style="font-size:11px;color:#a78bfa;">FRAME M (Tùy chọn)</strong><button data-role="copy-frame-m" title="Chốt frame hiện tại làm Frame M và ghi nhận tọa độ XYZ" style="height:24px;padding:0 8px;border:none;border-radius:5px;background:#7c3aed;color:white;cursor:pointer;font-size:10px;font-weight:700;">Chốt Frame M</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
          <label style="font-size:10px;color:#dbe4ff;">X
            <input data-role="frame-m-x" type="number" step="0.01" readonly placeholder="X" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
          </label>
          <label style="font-size:10px;color:#dbe4ff;">Y
            <input data-role="frame-m-y" type="number" step="0.01" readonly placeholder="Y" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor-not-allowed;opacity:0.85;" />
          </label>
          <label style="font-size:10px;color:#dbe4ff;">Z
            <input data-role="frame-m-z" type="number" step="0.01" readonly placeholder="Z" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor-not-allowed;opacity:0.85;" />
          </label>
          </div>
        </div>
        <div data-role="keyframe-card" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;"><strong style="font-size:11px;color:#6ee7b7;">FRAME B</strong><button data-role="copy-frame-b" title="Chốt frame hiện tại làm Frame B và ghi nhận tọa độ XYZ" style="height:24px;padding:0 8px;border:none;border-radius:5px;background:#059669;color:white;cursor:pointer;font-size:10px;font-weight:700;">Chốt Frame B</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
          <label style="font-size:10px;color:#dbe4ff;">X
            <input data-role="frame-b-x" type="number" step="0.01" readonly placeholder="X" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor:not-allowed;opacity:0.85;" />
          </label>
          <label style="font-size:10px;color:#dbe4ff;">Y
            <input data-role="frame-b-y" type="number" step="0.01" readonly placeholder="Y" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor-not-allowed;opacity:0.85;" />
          </label>
          <label style="font-size:10px;color:#dbe4ff;">Z
            <input data-role="frame-b-z" type="number" step="0.01" readonly placeholder="Z" style="width:100%;margin-top:4px;padding:6px;box-sizing:border-box;border:1px solid #3d4755;border-radius:5px;background:#0b1220;color:#cbd5e1;font-family:inherit;cursor-not-allowed;opacity:0.85;" />
          </label>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:7px;margin-bottom:9px;padding:6px 8px;border:1px solid #0284c7;border-radius:6px;background:rgba(14, 116, 144, 0.15);font-size:11px;color:#7dd3fc;cursor:pointer;" title="Khi nội suy qua các frame trung gian, cao độ Z của xe sẽ tự động bám sát theo độ dốc mặt đường thay vì đường thẳng">
          <input data-role="interp-snap-ground" type="checkbox" checked style="width:15px;height:15px;flex:0 0 15px;" />
          <span>Khóa Z bám mặt đường khi nội suy (Slope Alignment)</span>
        </label>
        <div data-role="frame-distance-result" style="padding:8px;border:1px solid #3b4655;border-radius:6px;background:#111827;color:#dbe4ff;font-size:11px;line-height:1.7;">
          Ghi nhận XYZ từ hai frame để tính khoảng cách.
        </div>
        <button data-role="apply-frame-delta" style="width:100%;height:34px;margin-top:8px;border:none;border-radius:7px;background:#16a34a;color:white;cursor:pointer;font-size:12px;font-weight:800;">Áp dụng nội suy lên frame hiện tại</button>
      </div>
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
        result.textContent =
          "Ghi nhận để tính khoảng cách.";
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

    const modeSelect = panel.querySelector('[data-role="frame-interpolation-mode"]');
    const frameMCard = panel.querySelector('[data-role="keyframe-card-m"]');
    const frameMInputWrapper = panel.querySelector('[data-role="frame-m-input-wrapper"]');

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

    const savedTab = localStorage.getItem("auto-lwh-panel-tab") || "transform";
    if (savedTab === "auto-fit") {
      const transformPane = panel.querySelector('[data-role="transform-pane"]');
      const autoFitPane = panel.querySelector('[data-role="auto-fit-pane"]');
      if (transformPane) transformPane.style.display = "none";
      if (autoFitPane) autoFitPane.style.display = "block";
      panel.querySelectorAll('[data-role="tab-button"]').forEach((button) => {
        button.dataset.active = String(button.dataset.tab === "auto-fit");
      });
    }

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
        localStorage.setItem("auto-lwh-lock-side-zoom", String(lockSideZoom.checked));
      });
    }

    const lockSideRotation = panel.querySelector('[data-role="lock-side-rotation"]');
    if (lockSideRotation) {
      const savedRotLock = localStorage.getItem("auto-lwh-lock-side-rotation");
      // Mặc định tắt để tránh hiện tượng lệch 2 box giữa 3D WebGL và khung 2D SVG
      lockSideRotation.checked = savedRotLock === "true";
      lockSideRotation.addEventListener("change", () => {
        localStorage.setItem("auto-lwh-lock-side-rotation", String(lockSideRotation.checked));
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

    // Cài đặt các điều khiển Căn chỉnh mặt đường (Ground Alignment)
    const groundOffsetInput = panel.querySelector('[data-role="ground-offset-input"]');
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

    const autoSnapGround = panel.querySelector('[data-role="auto-snap-ground"]');
    if (autoSnapGround) {
      autoSnapGround.checked = localStorage.getItem("auto-lwh-auto-snap-ground") === "true";
      autoSnapGround.addEventListener("change", () => {
        localStorage.setItem("auto-lwh-auto-snap-ground", String(autoSnapGround.checked));
        if (autoSnapGround.checked) {
          const obj = getSelectedObject();
          if (obj) snapObjectToGround(obj);
        }
      });
    }

    const interpSnapGround = panel.querySelector('[data-role="interp-snap-ground"]');
    if (interpSnapGround) {
      const savedInterpSnap = localStorage.getItem("auto-lwh-interp-snap-ground");
      interpSnapGround.checked = savedInterpSnap === null ? true : savedInterpSnap === "true";
      interpSnapGround.addEventListener("change", () => {
        localStorage.setItem("auto-lwh-interp-snap-ground", String(interpSnapGround.checked));
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
        if (curFrameNum !== null) {
          if (role === "copy-frame-a") {
            const startInput = panel.querySelector('[data-role="frame-start-index"]');
            if (startInput) startInput.value = curFrameNum;
          } else if (role === "copy-frame-m") {
            const middleInput = panel.querySelector('[data-role="frame-middle-index"]');
            if (middleInput) middleInput.value = curFrameNum;
          } else if (role === "copy-frame-b") {
            const endInput = panel.querySelector('[data-role="frame-end-index"]');
            if (endInput) endInput.value = curFrameNum;
          }
        }

        panel.querySelector(`[data-role="${prefix}-x"]`).value = Number(
          obj.position.x || 0,
        ).toFixed(3);
        panel.querySelector(`[data-role="${prefix}-y"]`).value = Number(
          obj.position.y || 0,
        ).toFixed(3);
        panel.querySelector(`[data-role="${prefix}-z"]`).value = Number(
          obj.position.z || 0,
        ).toFixed(3);
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
          (localStorage.getItem("auto-lwh-interp-snap-ground") !== "false");

        if (isInterpSnapGround) {
          const halfH = (obj.scale?.z || 1.5) / 2;
          const detected = detectGroundZ(
            targetX,
            targetY,
            targetZ - halfH,
            obj.scale?.x,
            obj.scale?.y
          );
          if (detected && typeof detected.groundZ === "number") {
            const offset = getSavedGroundOffset();
            targetZ = detected.groundZ + halfH + offset;
          }
        }

        applyObjectTransform(obj, {
          position: { x: targetX, y: targetY, z: targetZ },
        });

        const distResult = panel.querySelector('[data-role="frame-distance-result"]');
        if (distResult) {
          const modeLabels = {
            "linear": "Đi đều (Linear)",
            "ease-out": "Phanh chậm dần (Ease-Out)",
            "ease-in": "Tăng tốc (Ease-In)",
            "ease-in-out": "S-Curve",
            "quadratic": "Tự do 3 điểm A-M-B"
          };
          const curLabel = modeLabels[mode] || mode;
          const statusDiv = distResult.querySelector('[data-role="interp-status"]');
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
      if (role === "snap-overhead-btn" || target.closest('[data-role="snap-overhead-btn"]')) {
        const obj = getSelectedObject();
        if (obj) snapObjectOverhead(obj);
      }
      if (role === "snap-all-btn" || target.closest('[data-role="snap-all-btn"]')) {
        const obj = getSelectedObject();
        if (obj) snapObjectAll(obj);
      }
      if (role === "snap-ground-btn" || target.closest('[data-role="snap-ground-btn"]')) {
        const obj = getSelectedObject();
        if (obj) snapObjectToGround(obj);
      }
      if (role === "offset-preset") {
        const offsetVal = parseFloat(target.dataset.offset || "0");
        const offsetInput = panel.querySelector('[data-role="ground-offset-input"]');
        if (offsetInput) offsetInput.value = offsetVal.toFixed(2);
        localStorage.setItem("auto-lwh-ground-offset", String(offsetVal));
        const obj = getSelectedObject();
        if (obj) snapObjectToGround(obj, offsetVal);
      }
      if (role === "signal") applySignalSize();
      if (role === "cone") applyConeSize();
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
    });

    document.body.appendChild(panel);
    return panel;
  }

  function isPositionPanelEditing() {
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!panel) return false;

    const active = document.activeElement;
    const fields = [
      panel.querySelector('[data-role="x"]'),
      panel.querySelector('[data-role="y"]'),
      panel.querySelector('[data-role="z"]'),
      panel.querySelector('[data-role="l"]'),
      panel.querySelector('[data-role="w"]'),
      panel.querySelector('[data-role="h"]'),
    ];

    return fields.includes(active);
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
      const overheadBadge = panel.querySelector('[data-role="overhead-fit-badge"]');
      if (overheadBadge) {
        overheadBadge.textContent = "Chưa chọn box";
        overheadBadge.style.background = "#334155";
        overheadBadge.style.color = "#94a3b8";
      }
      if (groundBadge) {
        groundBadge.textContent = "Chưa chọn box";
        groundBadge.style.background = "#334155";
        groundBadge.style.color = "#94a3b8";
        groundBadge.title = "";
      }
      if (groundSnapBtn) groundSnapBtn.style.opacity = "0.6";
      if (!isEditing) {
        if (xInput) xInput.value = "0";
        if (yInput) yInput.value = "0";
        if (zInput) zInput.value = "0";
        if (lInput) lInput.value = "0";
        if (wInput) wInput.value = "0";
        if (hInput) hInput.value = "0";
      }
      return;
    }

    if (groundSnapBtn) groundSnapBtn.style.opacity = "1";

    if (groundBadge && obj.position && obj.scale) {
      const halfH = (obj.scale.z || 1.5) / 2;
      const curBottom = obj.position.z - halfH;
      const offsetInput = panel.querySelector('[data-role="ground-offset-input"]');
      const offset =
        offsetInput && Number.isFinite(parseFloat(offsetInput.value))
          ? parseFloat(offsetInput.value)
          : getSavedGroundOffset();

      const detected = detectGroundZ(
        obj.position.x,
        obj.position.y,
        curBottom,
        obj.scale.x,
        obj.scale.y
      );

      if (detected && typeof detected.groundZ === "number") {
        const targetBottom = detected.groundZ + offset;
        const diff = curBottom - targetBottom;
        const diffCm = Math.round(diff * 100);

        if (Math.abs(diffCm) <= 2) {
          groundBadge.textContent = "🟢 Chuẩn sát đường";
          groundBadge.style.background = "#14532d";
          groundBadge.style.color = "#86efac";
          groundBadge.title = `Đáy box: ${curBottom.toFixed(2)}m | Đường: ${detected.groundZ.toFixed(2)}m (Khớp sát)`;
        } else if (diffCm > 2) {
          groundBadge.textContent = `🟡 Bay +${diffCm}cm`;
          groundBadge.style.background = "#713f12";
          groundBadge.style.color = "#fde047";
          groundBadge.title = `Đáy box: ${curBottom.toFixed(2)}m | Đường: ${detected.groundZ.toFixed(2)}m (Đang bay cao hơn đường ${diffCm}cm)`;
        } else {
          groundBadge.textContent = `🔴 Lún ${diffCm}cm`;
          groundBadge.style.background = "#7f1d1d";
          groundBadge.style.color = "#fca5a5";
          groundBadge.title = `Đáy box: ${curBottom.toFixed(2)}m | Đường: ${detected.groundZ.toFixed(2)}m (Đang lún dưới mặt đường ${Math.abs(diffCm)}cm)`;
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
        if (xInput) xInput.value = Number(obj.position.x || 0).toFixed(2);
        if (yInput) yInput.value = Number(obj.position.y || 0).toFixed(2);
        if (zInput) zInput.value = Number(obj.position.z || 0).toFixed(2);
      }
      if (obj.scale) {
        if (lInput) lInput.value = Number(obj.scale.x || 0).toFixed(2);
        if (wInput) wInput.value = Number(obj.scale.y || 0).toFixed(2);
        if (hInput) hInput.value = Number(obj.scale.z || 0).toFixed(2);
      }
    }

    if (statusEl) {
      const posText = obj.position
        ? `${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)}`
        : "n/a";
      const sizeText = obj.scale
        ? `${obj.scale.x.toFixed(2)}, ${obj.scale.y.toFixed(2)}, ${obj.scale.z.toFixed(2)}`
        : "n/a";
      statusEl.textContent = `Pos: ${posText} | Size: ${sizeText}`;
    }

    updateCurrentFrameInput();
  }

  function updateCurrentFrameInput() {
    const panel = document.getElementById(POSITION_PANEL_ID);
    if (!panel) return;
    const currentInput = panel.querySelector('[data-role="frame-current-index"]');
    if (!currentInput || document.activeElement === currentInput) return;

    const curNum = getCurrentFrameNumber();
    if (curNum !== null && String(currentInput.value) !== String(curNum)) {
      currentInput.value = curNum;
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

  function setupSideViewZoomLock() {
    const pc = getPagePc();
    if (!pc || !Array.isArray(pc.renderViews)) return;

    const sideViews = pc.renderViews.filter(
      (view) =>
        view &&
        typeof view.fitObject === "function" &&
        view.camera &&
        view.camera.isOrthographicCamera &&
        view.axis !== undefined
    );

    sideViews.forEach((view) => {
      if (view.__auto_lwh_stabilized__) return;
      view.__auto_lwh_stabilized__ = true;

      let internalZoom = view.zoom || 1;
      let allowReset = false;

      // Khi người dùng double-click vào khung nhìn side view, cho phép reset cả zoom và góc xoay về mặc định
      if (view.container) {
        view.container.addEventListener(
          "dblclick",
          () => {
            allowReset = true;
            view.__force_heading_reset__ = true;
            setTimeout(() => {
              allowReset = false;
              view.__force_heading_reset__ = false;
            }, 200);
          },
          true
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
            (localStorage.getItem("auto-lwh-lock-side-zoom") !== "false");

          // Nếu bật khóa zoom, và hệ thống cố reset zoom về 1 khi SELECT / chuyển frame
          // trong khi annotator đang zoom ở mức khác 1 và không phải do double-click:
          if (isLockZoomEnabled && newVal === 1 && internalZoom !== 1 && !allowReset) {
            return;
          }

          internalZoom = newVal;
        },
      });

      // --- 2. Khóa Xoay Camera (Lock Camera Rotation / Heading) ---
      const originalFitObject = view.fitObject.bind(view);

      view.fitObject = function (targetObj) {
        if (targetObj) this.object = targetObj;
        const obj = this.object;
        if (!obj) return;

        const panel = document.getElementById(POSITION_PANEL_ID);
        const isLockRotEnabled =
          panel?.querySelector('[data-role="lock-side-rotation"]')?.checked ??
          (localStorage.getItem("auto-lwh-lock-side-rotation") === "true");

        const currentTrackId = obj.userData?.trackId;

        // Nếu không bật khóa xoay: dùng fitObject gốc của Xtreme1
        if (!isLockRotEnabled) {
          this.__locked_track_id__ = currentTrackId;
          this.__locked_quaternion__ = null;
          return originalFitObject(obj);
        }

        // Nếu đổi sang track khác hoặc chưa có quaternion khóa hoặc được lệnh reset:
        if (
          !this.__locked_quaternion__ ||
          this.__locked_track_id__ !== currentTrackId ||
          this.__force_heading_reset__
        ) {
          this.__locked_quaternion__ = obj.quaternion ? obj.quaternion.clone() : null;
          this.__locked_track_id__ = currentTrackId;
          this.__force_heading_reset__ = false;
        }

        if (!this.__locked_quaternion__) {
          return originalFitObject(obj);
        }

        obj.updateMatrixWorld();

        const Matrix4 = this.camera.matrixWorld.constructor;
        const Vector3 = this.camera.position.constructor;

        // Ma trận khóa: Tọa độ tâm (Position) và Scale thay đổi theo đối tượng ở frame mới,
        // nhưng Góc xoay (Quaternion) được cố định theo góc đã khóa!
        const lockedMatrix = new Matrix4();
        lockedMatrix.compose(
          obj.position,
          this.__locked_quaternion__,
          obj.scale
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
      };
    });
  }

  function init() {
    ensurePositionPanel();
    setupSideViewZoomLock();
    updatePositionPanel();

    const refreshSelection = () => {
      if (isPositionPanelEditing()) return;

      const autoSnap = localStorage.getItem("auto-lwh-auto-snap-ground") === "true";
      if (autoSnap) {
        const obj = getSelectedObject();
        if (obj) snapObjectToGround(obj);
      }

      requestAnimationFrame(() => updatePositionPanel());
      setTimeout(() => updatePositionPanel(), 60);
    };

    // Phím tắt Alt+G để lập tức hạ sát mặt đất
    window.addEventListener(
      "keydown",
      (e) => {
        if (isPositionPanelEditing()) return;
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea") return;

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
      },
      true
    );

    window.addEventListener("focus", refreshSelection);
    window.addEventListener("mouseup", refreshSelection);
    window.addEventListener("pointerup", refreshSelection);
    window.addEventListener("touchend", refreshSelection);
    window.addEventListener("keyup", refreshSelection);

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
        });
      });
    }

    const editor =
      window.editor || window.__APP__?.editor || window.app?.editor;
    editor?.addEventListener?.("frameChange", refreshSelection);
    editor?.addEventListener?.("FRAME_CHANGE", refreshSelection);

    const pc = getPagePc();
    pc?.addEventListener?.("SELECT", refreshSelection);
    pc?.addEventListener?.("OBJECT_TRANSFORM", refreshSelection);
    pc?.addEventListener?.("select", refreshSelection);
    pc?.addEventListener?.("objectTransform", refreshSelection);
    pc?.addEventListener?.("dragend", refreshSelection);
    pc?.addEventListener?.("pointerup", refreshSelection);
    pc?.addEventListener?.("mouseup", refreshSelection);

    const syncTimer = setInterval(() => {
      setupSideViewZoomLock();
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
