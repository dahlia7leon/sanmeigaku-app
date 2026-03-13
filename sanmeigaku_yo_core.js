// sanmeigaku_yo_core.js
// 陽占コア
// - 十大主星: 既存ロジックを利用
// - 十二大従星: 日干 + 各支 から算出
// 必要ファイル:
//   stems_master.json
//   branches_master.json
//   judaishusei_map.json
//   juniun_table.json
//   junidaijusei_master.json

(function () {
  "use strict";

  const YO_MASTER = {
    loaded: false,
    stemsMaster: null,
    branchesMaster: null,
    judaishuseiMap: null,
    juniunTable: null,
    junidaijuseiMaster: null
  };

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`JSON読み込み失敗: ${path} (${res.status})`);
    }
    return await res.json();
  }

  async function loadYoMasters() {
    if (YO_MASTER.loaded) return YO_MASTER;

    const [
      stemsMaster,
      branchesMaster,
      judaishuseiMap,
      juniunTable,
      junidaijuseiMaster
    ] = await Promise.all([
      fetchJson("./stems_master.json"),
      fetchJson("./branches_master.json"),
      fetchJson("./judaishusei_map.json"),
      fetchJson("./juniun_table.json"),
      fetchJson("./junidaijusei_master.json")
    ]);

    YO_MASTER.stemsMaster = stemsMaster;
    YO_MASTER.branchesMaster = branchesMaster;
    YO_MASTER.judaishuseiMap = judaishuseiMap;
    YO_MASTER.juniunTable = juniunTable;
    YO_MASTER.junidaijuseiMaster = junidaijuseiMaster;
    YO_MASTER.loaded = true;

    return YO_MASTER;
  }

  function assertPillars(pillars) {
    if (!pillars || !pillars.year || !pillars.month || !pillars.day) {
      throw new Error("pillars.year / month / day が必要です");
    }
    if (!pillars.year.stem || !pillars.year.branch ||
        !pillars.month.stem || !pillars.month.branch ||
        !pillars.day.stem || !pillars.day.branch) {
      throw new Error("各柱に stem / branch が必要です");
    }
  }

  // =========================
  // 十大主星
  // =========================
  // 既存の map 形式が
  // judaishuseiMap[dayStem][targetStem] = "星名"
  // を想定
  function getJudaishusei(dayStem, targetStem) {
    const mapByDayStem = YO_MASTER.judaishuseiMap?.[dayStem];
    if (!mapByDayStem) {
      throw new Error(`judaishusei_map.json に日干 ${dayStem} がありません`);
    }

    const star = mapByDayStem[targetStem];
    if (!star) {
      throw new Error(`十大主星未定義: 日干=${dayStem}, 対象干=${targetStem}`);
    }

    return star;
  }

  function calculateJudaishuseiSet(pillars) {
    const dayStem = pillars.day.stem;

    return {
      year: getJudaishusei(dayStem, pillars.year.stem),
      center: getJudaishusei(dayStem, pillars.month.stem),
      day: getJudaishusei(dayStem, pillars.day.stem)
    };
  }

  // =========================
  // 十二大従星
  // =========================
  function getJuniun(dayStem, targetBranch) {
    const tableByDayStem = YO_MASTER.juniunTable?.[dayStem];
    if (!tableByDayStem) {
      throw new Error(`juniun_table.json に日干 ${dayStem} がありません`);
    }

    const juniun = tableByDayStem[targetBranch];
    if (!juniun) {
      throw new Error(`十二運未定義: 日干=${dayStem}, 支=${targetBranch}`);
    }

    return juniun;
  }

  function getJunidaijusei(dayStem, targetBranch) {
    const juniun = getJuniun(dayStem, targetBranch);
    const master = YO_MASTER.junidaijuseiMaster?.[juniun];

    if (!master) {
      throw new Error(`junidaijusei_master.json に十二運 ${juniun} がありません`);
    }

    return {
      juniun,
      star: master.star,
      energy: master.energy,
      phase: master.phase,
      keywords: master.keywords
    };
  }

  function calculateJunidaijuseiSet(pillars) {
    const dayStem = pillars.day.stem;

    return {
      year: getJunidaijusei(dayStem, pillars.year.branch),
      month: getJunidaijusei(dayStem, pillars.month.branch),
      day: getJunidaijusei(dayStem, pillars.day.branch)
    };
  }

  // =========================
  // 陽占まとめ
  // =========================
  async function calculateYoSen(pillars) {
    await loadYoMasters();
    assertPillars(pillars);

    const judaishusei = calculateJudaishuseiSet(pillars);
    const junidaijusei = calculateJunidaijuseiSet(pillars);

    return {
      judaishusei,
      junidaijusei
    };
  }

  // =========================
  // デバッグ表示
  // =========================
  function renderYoDebug(container, yoResult) {
    if (!container) return;

    const { judaishusei, junidaijusei } = yoResult;

    container.innerHTML = `
      <div class="yo-debug-block">
        <h3>陽占（デバッグ表示）</h3>

        <div class="yo-section">
          <h4>十大主星</h4>
          <ul>
            <li>年：${judaishusei.year}</li>
            <li>中心：${judaishusei.center}</li>
            <li>日：${judaishusei.day}</li>
          </ul>
        </div>

        <div class="yo-section">
          <h4>十二大従星</h4>
          <ul>
            <li>年：${junidaijusei.year.star}（${junidaijusei.year.juniun} / ${junidaijusei.year.energy}点）</li>
            <li>月：${junidaijusei.month.star}（${junidaijusei.month.juniun} / ${junidaijusei.month.energy}点）</li>
            <li>日：${junidaijusei.day.star}（${junidaijusei.day.juniun} / ${junidaijusei.day.energy}点）</li>
          </ul>
        </div>
      </div>
    `;
  }

  // =========================
  // 公開
  // =========================
  window.loadYoMasters = loadYoMasters;
  window.calculateYoSen = calculateYoSen;
  window.calculateJudaishuseiSet = calculateJudaishuseiSet;
  window.calculateJunidaijuseiSet = calculateJunidaijuseiSet;
  window.getJuniun = getJuniun;
  window.getJunidaijusei = getJunidaijusei;
  window.renderYoDebug = renderYoDebug;
})();
