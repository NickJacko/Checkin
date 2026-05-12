// data.js — localStorage wrapper for DailyCheck

const Data = {
  // --- User ---
  getUser() {
    return localStorage.getItem('dc_username') || null;
  },
  setUser(name) {
    localStorage.setItem('dc_username', name.trim());
  },

  // --- Today's submission ---
  todayKey() {
    return 'dc_sub_' + new Date().toISOString().slice(0, 10);
  },
  hasSubmittedToday() {
    return !!localStorage.getItem(this.todayKey());
  },
  submitToday(name, skala, schaetzung) {
    const entry = { name, skala, schaetzung, ts: Date.now() };
    localStorage.setItem(this.todayKey(), JSON.stringify(entry));
    this._updateLeaderboard(name, skala, schaetzung);
  },
  getTodaySubmission() {
    const raw = localStorage.getItem(this.todayKey());
    return raw ? JSON.parse(raw) : null;
  },

  // --- All submissions for a given date (multi-user on same browser won't work,
  //     but for GitHub Pages / shared device or demo, we store all under a list key)
  allKey(dateStr) {
    return 'dc_all_' + dateStr;
  },
  submitTodayShared(name, skala, schaetzung) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const key = this.allKey(dateStr);
    const raw = localStorage.getItem(key);
    let list = raw ? JSON.parse(raw) : [];
    // Remove old entry from same user if exists
    list = list.filter(e => e.name !== name);
    list.push({ name, skala, schaetzung, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(list));
    // Also mark personal submission
    localStorage.setItem(this.todayKey(), JSON.stringify({ name, skala, schaetzung, ts: Date.now() }));
    this._updateLeaderboard(name, skala, schaetzung);
  },
  getAllForDate(dateStr) {
    const raw = localStorage.getItem(this.allKey(dateStr));
    return raw ? JSON.parse(raw) : [];
  },
  getTodayAll() {
    return this.getAllForDate(new Date().toISOString().slice(0, 10));
  },

  // --- Leaderboard ---
  getLeaderboard() {
    const raw = localStorage.getItem('dc_leaderboard');
    return raw ? JSON.parse(raw) : {};
  },
  _updateLeaderboard(name, skala, schaetzung) {
    const lb = this.getLeaderboard();
    if (!lb[name]) lb[name] = { points: 0, days: 0 };
    lb[name].days += 1;
    lb[name].points += 1; // +1 participation; accuracy bonus added by admin when answer is revealed
    // Calculate accuracy bonus vs today's question answer
    const q = Questions.getToday();
    if (q && q.answer !== undefined) {
      const diff = Math.abs(schaetzung - q.answer);
      const maxDiff = q.answer * 2 || 100;
      const accuracy = Math.max(0, 1 - diff / maxDiff);
      const bonus = Math.round(accuracy * 10);
      lb[name].points += bonus;
    }
    localStorage.setItem('dc_leaderboard', JSON.stringify(lb));
  },
  getLeaderboardSorted() {
    const lb = this.getLeaderboard();
    return Object.entries(lb)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.points - a.points);
  },

  // --- Reset (dev) ---
  resetToday() {
    localStorage.removeItem(this.todayKey());
  },
  clearAll() {
    Object.keys(localStorage).filter(k => k.startsWith('dc_')).forEach(k => localStorage.removeItem(k));
  }
};
