// sanmeigaku_yo_core.js
// 陽占コア
// - 十大主星: 五行相互関係 + judaishusei_map.json から算出
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
  // 五行相互関係の計算
  // =========================

  // 十干の五行対応
  function getStemElement(stem) {
    const elemMap = {
      "甲": "木", "乙": "木",
      "丙": "火", "丁": "火",
      "戊": "土", "己": "土",
      "庚": "金", "辛": "金",
      "壬": "水", "癸": "水"
    };
    return elemMap[stem] || null;
  }

  // 十干の陰陽判定（甲=陽, 乙=陰, 丙=陽, ...）
  function getStemPolarity(stem) {
    const polarityMap = {
      "甲": "odd",   "乙": "even",
      "丙": "odd",   "丁": "even",
      "戊": "odd",   "己": "even",
      "庚": "odd",   "辛": "even",
      "壬": "odd",   "癸": "even"
    };
    return polarityMap[stem] || null;
  }

  // 五行の相互関係を計算
  // base = 日干, target = 対象干
  // 戻り値: "same", "generates", "generatedBy", "controls", "controlledBy"
  function getFiveElementRelation(baseStem, targetStem) {
    const baseElem = getStemElement(baseStem);
    const targetElem = getStemElement(targetStem);

    if (!baseElem || !targetElem) {
      throw new Error(`五行判定失敗: 日干=${baseStem}, 対象干=${targetStem}`);
    }

    // 同じ五行
    if (baseElem === targetElem) {
      return "same";
    }

    // 相生関係（AがBを生む）
    const generates = {
      "木": "火",
      "火": "土",
      "土": "金",
      "金": "水",
      "水": "木"
    };

    // 相剋関係（AがBを剋す）
    const controls = {
      "木": "土",
      "土": "水",
      "水": "火",
      "火": "金",
      "金": "木"
    };

    if (generates[baseElem] === targetElem) {
      return "generates"; // 日干が対象干を生む
    }

    if (generates[targetElem] === baseElem) {
      return "generatedBy"; // 対象干が日干を生む
    }

    if (controls[baseElem] === targetElem) {
      return "controls"; // 日干が対象干を剋す
    }

    if (controls[targetElem] === baseElem) {
      return "controlledBy"; // 対象干が日干を剋す
    }

    throw new Error(`五行関係不明: ${baseElem} と ${targetElem}`);
  }

  // =========================
  // 十大主星
  // =========================

  function getJudaishusei(dayStem, targetStem) {
    // 五行の相互関係を計算
    const relation = getFiveElementRelation(dayStem, targetStem);
    
    // 対象干の陰陽を取得
    const polarity = getStemPolarity(targetStem);

    // judaishusei_map.json から該当する星を取得
    const relationData = YO_MASTER.judaishuseiMap?.[relation];
    if (!relationData) {
      throw new Error(`judaishusei_map.json に関係 ${relation} がありません`);
    }

    const star = relationData[polarity];
    if (!star) {
      throw new Error(`十大主星未定義: 関係=${relation}, 陰陽=${polarity}`);
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

    // ✅ プロパティ名を index.html の期待形式に合わせる
    return {
      star: master.star || master.name || juniun,  // 従星の名前
      juniun: juniun,                               // 十二運の名前
      energy: master.energy || null,                // エネルギー値
      phase: master.phase || null,                  // 位相
      keywords: master.keywords || []               // キーワード配列
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
  window.getFiveElementRelation = getFiveElementRelation;
  window.getStemElement = getStemElement;
  window.getStemPolarity = getStemPolarity;

})();
