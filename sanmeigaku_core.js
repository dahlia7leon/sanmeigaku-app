class SanmeigakuCore {
  static _initialized = false;
  static _master = null;
  static _solarTerms = null;
  static _nameMap = new Map();
  static _idMap = new Map();

  static async init(options = {}) {
    if (this._initialized && !options.forceReload) return;

    const masterPath = options.masterPath || './kanshi_master.json';
    const solarTermsPath = options.solarTermsPath || './solar_terms.json';

    const [masterRes, solarRes] = await Promise.all([
      fetch(masterPath),
      fetch(solarTermsPath)
    ]);

    if (!masterRes.ok) {
      throw new Error(`kanshi_master.json の読み込みに失敗しました: ${masterRes.status}`);
    }
    if (!solarRes.ok) {
      throw new Error(`solar_terms.json の読み込みに失敗しました: ${solarRes.status}`);
    }

    this._master = await masterRes.json();
    this._solarTerms = await solarRes.json();
    this._buildIndexes();
    this._initialized = true;
  }

  static _buildIndexes() {
    this._nameMap = new Map();
    this._idMap = new Map();

    for (const row of this._master) {
      const normalized = this._normalizeMasterRow(row);
      this._nameMap.set(normalized.name, normalized);
      this._idMap.set(normalized.id, normalized);
    }
  }

  static _normalizeMasterRow(row) {
    const kan = row.kan || (row.name ? row.name.charAt(0) : null);
    const shi = row.shi || (row.name ? row.name.charAt(1) : null);
    const kanIndex = row.kan_index || this._getKanIndex(kan);
    const shiIndex = row.shi_index || this._getShiIndex(shi);

    return {
      ...row,
      kan,
      shi,
      kan_index: kanIndex,
      shi_index: shiIndex,
      zokan: {
        sho: row.zokan?.sho ?? null,
        chu: row.zokan?.chu ?? null,
        hon: row.zokan?.hon ?? null
      }
    };
  }

  static _requireInit() {
    if (!this._initialized) {
      throw new Error('SanmeigakuCore.init() を先に実行してください');
    }
  }

  static _getKanIndex(kan) {
    return ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].indexOf(kan) + 1;
  }

  static _getShiIndex(shi) {
    return ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'].indexOf(shi) + 1;
  }

  static _fix60(id) {
    return ((id - 1) % 60 + 60) % 60 + 1;
  }

  static _byId(id) {
    this._requireInit();
    return this._idMap.get(this._fix60(id)) || null;
  }

  static _byName(name) {
    this._requireInit();
    return this._nameMap.get(name) || null;
  }

  static _toJstDate(dateInput) {
    if (dateInput instanceof Date) return dateInput;

    if (typeof dateInput === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        return new Date(`${dateInput}T12:00:00+09:00`);
      }
      return new Date(dateInput);
    }

    if (typeof dateInput === 'object' && dateInput) {
      const { y, m, d, hour = 12, minute = 0, second = 0 } = dateInput;
      return new Date(
        `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+09:00`
      );
    }

    throw new Error('日付の形式が不正です');
  }

  static _getJstDateParts(dateInput) {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [y, m, d] = dateInput.split('-').map(Number);
      return { y, m, d };
    }

    if (
      typeof dateInput === 'object' &&
      dateInput &&
      !(dateInput instanceof Date) &&
      'y' in dateInput &&
      'm' in dateInput &&
      'd' in dateInput
    ) {
      return {
        y: Number(dateInput.y),
        m: Number(dateInput.m),
        d: Number(dateInput.d)
      };
    }

    const date = this._toJstDate(dateInput);
    const parts = date
      .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' })
      .slice(0, 10)
      .split('-')
      .map(Number);

    return { y: parts[0], m: parts[1], d: parts[2] };
  }

  static _ymdToNumber({ y, m, d }) {
    return y * 10000 + m * 100 + d;
  }

  static _termToJstDateParts(isoString) {
    const date = new Date(isoString);
    const parts = date
      .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' })
      .slice(0, 10)
      .split('-')
      .map(Number);

    return { y: parts[0], m: parts[1], d: parts[2] };
  }

  static _getTerms(year) {
    this._requireInit();
    const terms = this._solarTerms[String(year)];
    if (!terms) {
      throw new Error(`solar_terms.json に ${year} 年のデータがありません`);
    }
    return terms;
  }

  static _termDateNumber(year, key) {
    const parts = this._termToJstDateParts(this._getTerms(year)[key]);
    return this._ymdToNumber(parts);
  }

  static getYearPillar(dateInput) {
    this._requireInit();

    const birthParts = this._getJstDateParts(dateInput);
    const birthNumber = this._ymdToNumber(birthParts);
    const risshunNumber = this._termDateNumber(birthParts.y, 'risshun');

    const effectiveYear = birthNumber < risshunNumber ? birthParts.y - 1 : birthParts.y;
    const id = ((effectiveYear - 1984) % 60 + 60) % 60 + 1;

    return {
      pillar: this._byId(id),
      effectiveYear,
      boundaryUsed: '立春'
    };
  }

  static getSolarMonthInfo(dateInput) {
    this._requireInit();

    const birthParts = this._getJstDateParts(dateInput);
    const birthNumber = this._ymdToNumber(birthParts);
    const year = birthParts.y;
    const terms = this._getTerms(year);

    const boundaries = [
      { key: 'risshun', label: '立春', index: 1, branch: '寅' },
      { key: 'keichitsu', label: '啓蟄', index: 2, branch: '卯' },
      { key: 'seimei', label: '清明', index: 3, branch: '辰' },
      { key: 'rikka', label: '立夏', index: 4, branch: '巳' },
      { key: 'boushu', label: '芒種', index: 5, branch: '午' },
      { key: 'shousho', label: '小暑', index: 6, branch: '未' },
      { key: 'risshuu', label: '立秋', index: 7, branch: '申' },
      { key: 'hakuro', label: '白露', index: 8, branch: '酉' },
      { key: 'kanro', label: '寒露', index: 9, branch: '戌' },
      { key: 'rittou', label: '立冬', index: 10, branch: '亥' },
      { key: 'taisetsu', label: '大雪', index: 11, branch: '子' }
    ];

    const risshunNumber = this._termDateNumber(year, 'risshun');
    const shoukanNumber = this._termDateNumber(year, 'shoukan');

    if (birthNumber < risshunNumber) {
      if (birthNumber < shoukanNumber) {
        return {
          index: 11,
          label: '子月',
          branch: '子',
          boundaryUsed: '大雪',
          boundaryKey: 'taisetsu'
        };
      }

      return {
        index: 12,
        label: '丑月',
        branch: '丑',
        boundaryUsed: '小寒',
        boundaryKey: 'shoukan'
      };
    }

    let current = boundaries[0];

    for (const boundary of boundaries) {
      const boundaryNumber = this._ymdToNumber(
        this._termToJstDateParts(terms[boundary.key])
      );

      if (birthNumber >= boundaryNumber) {
        current = boundary;
      } else {
        break;
      }
    }

    return {
      index: current.index,
      label: `${current.branch}月`,
      branch: current.branch,
      boundaryUsed: current.label,
      boundaryKey: current.key
    };
  }

  static getMonthPillar(dateInput) {
    this._requireInit();

    const yearInfo = this.getYearPillar(dateInput);
    const monthInfo = this.getSolarMonthInfo(dateInput);

    const startStemMap = {
      '甲': 3, '己': 3,
      '乙': 5, '庚': 5,
      '丙': 7, '辛': 7,
      '丁': 9, '壬': 9,
      '戊': 1, '癸': 1
    };

    const startStemIndex = startStemMap[yearInfo.pillar.kan];
    const monthStemIndex = ((startStemIndex - 1) + (monthInfo.index - 1)) % 10 + 1;
    const monthBranchIndex = ((3 - 1) + (monthInfo.index - 1)) % 12 + 1;

    const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const name = `${stems[monthStemIndex - 1]}${branches[monthBranchIndex - 1]}`;

    return {
      pillar: this._byName(name),
      solarMonthInfo: monthInfo
    };
  }

  static getDayPillar(dateInput) {
    this._requireInit();

    const birth = this._toJstDate(dateInput);
    const y = Number(birth.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 4));
    const m = Number(birth.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(5, 7));
    const d = Number(birth.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(8, 10));

    const baseUtc = Date.UTC(1900, 0, 31, 12, 0, 0);
    const targetUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
    const diffDays = Math.floor((targetUtc - baseUtc) / 86400000);

    const baseId = 41; // 1900-01-31 = 甲辰

    return {
      pillar: this._byId(baseId + diffDays),
      diffDays,
      baseDate: '1900-01-31',
      baseId
    };
  }

  static calculateThreePillars(dateInput) {
    this._requireInit();

    const date = this._toJstDate(dateInput);
    const year = this.getYearPillar(dateInput);
    const month = this.getMonthPillar(dateInput);
    const day = this.getDayPillar(dateInput);

    return {
      input: {
        birthdate: date.toISOString()
      },
      pillars: {
        year: year.pillar,
        month: month.pillar,
        day: day.pillar
      },
      meta: {
        solarMonthIndex: month.solarMonthInfo.index,
        solarMonthLabel: month.solarMonthInfo.label,
        boundaryUsed: month.solarMonthInfo.boundaryUsed,
        warnings: []
      },
      debug: {
        effectiveYear: year.effectiveYear,
        dayBaseId: day.baseId,
        dayDiffDays: day.diffDays
      }
    };
  }

  static async validate(validationPath = './validation_cases.json') {
    await this.init();

    const res = await fetch(validationPath);
    if (!res.ok) {
      throw new Error(`validation_cases.json の読み込みに失敗しました: ${res.status}`);
    }

    const cases = await res.json();

    const results = cases.map((item) => {
      const calc = this.calculateThreePillars(item.date);
      const actual = {
        year: calc.pillars.year?.name || null,
        month: calc.pillars.month?.name || null,
        day: calc.pillars.day?.name || null
      };

      return {
        date: item.date,
        expected: item.expected,
        actual,
        ok:
          actual.year === item.expected.year &&
          actual.month === item.expected.month &&
          actual.day === item.expected.day
      };
    });

    return {
      total: results.length,
      passed: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results
    };
  }

  static async validateMonthBoundaries(validationPath = './validation_month_boundaries.json') {
    await this.init();

    const res = await fetch(validationPath);
    if (!res.ok) {
      throw new Error(`validation_month_boundaries.json の読み込みに失敗しました: ${res.status}`);
    }

    const cases = await res.json();

    const results = cases.map((item) => {
      const calc = this.getMonthPillar(item.date);
      const actualMonth = calc.pillar?.name || null;

      return {
        date: item.date,
        expectedMonth: item.expectedMonth,
        actualMonth,
        notes: item.notes || '',
        ok: actualMonth === item.expectedMonth
      };
    });

    return {
      total: results.length,
      passed: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results
    };
  }
}

// グローバル公開
window.SanmeigakuCore = SanmeigakuCore;

// index.html から呼ぶための外部公開関数
window.calculateSanmeigaku = async function (payloadOrBirthDate, maybeBirthTime) {
  let birthDate;
  let birthTime;

  if (typeof payloadOrBirthDate === 'object' && payloadOrBirthDate !== null) {
    birthDate = payloadOrBirthDate.birthDate;
    birthTime = payloadOrBirthDate.birthTime || null;
  } else {
    birthDate = payloadOrBirthDate;
    birthTime = maybeBirthTime || null;
  }

  if (!birthDate) {
    throw new Error('birthDate がありません');
  }

  // 初期化
  await SanmeigakuCore.init();

  // 時刻があれば ISO 風文字列へ、なければ日付文字列のまま使う
  const dateInput = birthTime
    ? `${birthDate}T${birthTime}:00+09:00`
    : birthDate;

  const result = SanmeigakuCore.calculateThreePillars(dateInput);

  // index.html / sanmeigaku_yo_core.js が期待する形に正規化
  const normalizedPillars = {
    year: {
      stem: result.pillars.year?.kan || null,
      branch: result.pillars.year?.shi || null,
      name: result.pillars.year?.name || null,
      kan_index: result.pillars.year?.kan_index || null,
      shi_index: result.pillars.year?.shi_index || null,
      zokan: result.pillars.year?.zokan || null
    },
    month: {
      stem: result.pillars.month?.kan || null,
      branch: result.pillars.month?.shi || null,
      name: result.pillars.month?.name || null,
      kan_index: result.pillars.month?.kan_index || null,
      shi_index: result.pillars.month?.shi_index || null,
      zokan: result.pillars.month?.zokan || null
    },
    day: {
      stem: result.pillars.day?.kan || null,
      branch: result.pillars.day?.shi || null,
      name: result.pillars.day?.name || null,
      kan_index: result.pillars.day?.kan_index || null,
      shi_index: result.pillars.day?.shi_index || null,
      zokan: result.pillars.day?.zokan || null
    }
  };

  return {
    input: result.input,
    pillars: normalizedPillars,
    rawPillars: result.pillars,
    meta: result.meta,
    debug: result.debug
  };
};