// ShieldHealth Dashboard Frontend Controller
let currentVaccine = "BCG";
let appStats = {
    demographics: 0,
    events: 0,
    reconciled: 0
};
let coverageChartInstance = null;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initEventListeners();
    fetchData();
});

// Sidebar Navigation Controller
function initNavigation() {
    const navButtons = document.querySelectorAll("#sidebar-nav .nav-btn");
    const sections = document.querySelectorAll(".panel-section");
    const panelTitle = document.getElementById("panel-title");
    const panelSubtitle = document.getElementById("panel-subtitle");

    const titles = {
        "dashboard-panel": { title: "District Planning Dashboard", subtitle: "Mobile-Population Vaccination Coverage Analysis & Prioritization" },
        "review-panel": { title: "Deduplication Review Queue", subtitle: "Human-in-the-Loop Linkage Verification" },
        "field-panel": { title: "Point of Care Registry Lookup", subtitle: "Offline Patient Verification Simulator" },
        "metrics-panel": { title: "Experiment Metrics Board", subtitle: "Algorithmic Precision vs Naive Baselines Analysis" },
        "docs-panel": { title: "Project Reference Library", subtitle: "System architecture, specifications, and approach rationale" }
    };

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-target");
            
            navButtons.forEach(b => {
                b.classList.remove("active", "bg-teal-50", "text-teal-700", "font-bold");
                b.classList.add("text-slate-600");
            });
            sections.forEach(s => s.classList.remove("active"));
            
            btn.classList.add("active", "bg-teal-50", "text-teal-700", "font-bold");
            btn.classList.remove("text-slate-600");
            
            const targetSection = document.getElementById(target);
            if (targetSection) {
                targetSection.classList.add("active");
            }
            
            // Update Headers
            if (titles[target]) {
                panelTitle.textContent = titles[target].title;
                panelSubtitle.textContent = titles[target].subtitle;
            }
        });
    });
}

function initEventListeners() {
    // Re-ingest button click
    const reingestBtn = document.getElementById("reingest-btn");
    if (reingestBtn) {
        reingestBtn.addEventListener("click", triggerReingest);
    }
    
    // Config controls change triggers reload
    const kInput = document.getElementById("k-input");
    if (kInput) {
        kInput.addEventListener("change", fetchCoverage);
    }
    
    const outageSelect = document.getElementById("outage-select");
    if (outageSelect) {
        outageSelect.addEventListener("change", triggerReingest);
    }

    // Vaccine tab pills click
    const tabList = document.getElementById("vaccine-tabs-list");
    if (tabList) {
        tabList.addEventListener("click", (e) => {
            const tab = e.target.closest(".tab-btn");
            if (!tab) return;
            
            document.querySelectorAll("#vaccine-tabs-list .tab-btn").forEach(t => {
                t.classList.remove("active", "border-teal-500", "bg-teal-50/60", "text-teal-800");
                t.classList.add("border-slate-200", "bg-slate-50/50", "text-slate-700");
                const badge = t.querySelector("span:last-child");
                if (badge) {
                    badge.classList.remove("text-teal-600", "font-bold");
                    badge.classList.add("text-slate-400");
                }
            });

            tab.classList.add("active", "border-teal-500", "bg-teal-50/60", "text-teal-800");
            tab.classList.remove("border-slate-200", "bg-slate-50/50", "text-slate-700");
            const activeBadge = tab.querySelector("span:last-child");
            if (activeBadge) {
                activeBadge.classList.add("text-teal-600", "font-bold");
                activeBadge.classList.remove("text-slate-400");
            }

            currentVaccine = tab.getAttribute("data-vac");
            fetchCoverage();
        });
    }

    // POC search listeners
    const pocBtn = document.getElementById("poc-search-btn");
    if (pocBtn) {
        pocBtn.addEventListener("click", performPocSearch);
    }
    const pocInput = document.getElementById("poc-search-input");
    if (pocInput) {
        pocInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") performPocSearch();
        });
    }
}

// Fetch all database numbers
async function fetchData() {
    await fetchSystemTrust();
    await fetchCoverage();
    await fetchReviewQueue();
    await fetchMetrics();
}

// REST call: Trust status monitoring
async function fetchSystemTrust() {
    try {
        const res = await fetch("/api/system/trust-status");
        const data = await res.json();
        
        const dot = document.getElementById("system-dot");
        const statusText = document.getElementById("system-text");
        const banner = document.getElementById("trust-banner");
        const bannerDesc = document.getElementById("trust-banner-desc");

        statusText.textContent = `Feeds: ${data.status}`;
        dot.className = "status-indicator-dot w-2.5 h-2.5 rounded-full animate-pulse";
        
        if (data.status === "STABLE") {
            dot.classList.add("bg-emerald-500");
            banner.classList.add("hidden");
        } else {
            dot.classList.add("bg-amber-500");
            banner.classList.remove("hidden");
            bannerDesc.textContent = data.reasons.join(" | ");
        }
    } catch (err) {
        console.error("Error checking trust status:", err);
    }
}

// REST call: Ingest database
async function triggerReingest() {
    const btn = document.getElementById("reingest-btn");
    const outageSelect = document.getElementById("outage-select").value;
    
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Ingesting...`;
    
    let offlineList = [];
    if (outageSelect !== "none") {
        offlineList = outageSelect.split(",");
    }

    try {
        const res = await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                trigger_generation: true,
                offline_facilities: offlineList
            })
        });
        const data = await res.json();
        
        if (data.status === "success") {
            document.getElementById("count-demographics").textContent = data.demographics_count;
            document.getElementById("count-events").textContent = data.services_count;
            
            appStats.demographics = data.demographics_count;
            appStats.events = data.services_count;
            
            await fetchData();
        }
    } catch (err) {
        console.error("Error during data re-ingest:", err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-rotate"></i> Re-ingest Data`;
    }
}

// REST call: Get coverage rate table
async function fetchCoverage() {
    const kVal = document.getElementById("k-input").value || 10;
    
    try {
        const res = await fetch(`/api/coverage?k=${kVal}`);
        const data = await res.json();
        
        // Calculate deduplicated count (cohort size)
        let totalReconciledEligible = 0;
        Object.values(data.reconciled).forEach(cluster => {
            totalReconciledEligible += cluster.total_eligible;
        });
        document.getElementById("count-reconciled").textContent = totalReconciledEligible;
        
        // Compute deduplication ratio saving
        if (appStats.demographics > 0) {
            const pctDiff = ((appStats.demographics - totalReconciledEligible) / appStats.demographics * 100).toFixed(1);
            document.getElementById("cohort-reduction").textContent = `-${pctDiff}% redundancy eliminated`;
        } else {
            document.getElementById("cohort-reduction").textContent = `Deduplicated Cohort`;
        }
        
        renderCoverageTable(data.naive, data.reconciled);
        renderCoverageChart(data.naive, data.reconciled);
    } catch (err) {
        console.error("Error fetching coverage stats:", err);
    }
}

// Render Coverage Comparison Chart (Chart.js)
function renderCoverageChart(naiveData, reconciledData) {
    const ctx = document.getElementById("coverageChart");
    if (!ctx) return;

    const clusters = Object.keys(reconciledData).sort();
    const naiveRates = [];
    const reconciledRates = [];

    clusters.forEach(cluster => {
        const n = naiveData[cluster] ? naiveData[cluster][currentVaccine] : null;
        const r = reconciledData[cluster] ? reconciledData[cluster].vaccines[currentVaccine] : null;
        
        const nRate = n ? Math.round(n.rate * 100) : 0;
        let rRate = 0;
        
        if (reconciledData[cluster].privacy_status !== "SUPPRESSED" && r) {
            rRate = Math.round(r.rate * 100);
        }
        
        naiveRates.push(nRate);
        reconciledRates.push(rRate);
    });

    if (coverageChartInstance) {
        coverageChartInstance.destroy();
    }

    coverageChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: clusters.map(c => `Cluster ${c}`),
            datasets: [
                {
                    label: `Naive ${currentVaccine} Coverage (%)`,
                    data: naiveRates,
                    backgroundColor: 'rgba(244, 63, 94, 0.85)',
                    borderColor: 'rgba(225, 29, 72, 1)',
                    borderWidth: 1,
                    borderRadius: 6
                },
                {
                    label: `Reconciled ${currentVaccine} Coverage (%)`,
                    data: reconciledRates,
                    backgroundColor: 'rgba(13, 148, 136, 0.85)',
                    borderColor: 'rgba(15, 118, 110, 1)',
                    borderWidth: 1,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: value => `${value}%`,
                        color: '#64748b',
                        font: { family: 'Inter', size: 11 }
                    },
                    grid: { color: '#f1f5f9' }
                },
                x: {
                    ticks: {
                        color: '#475569',
                        font: { family: 'Inter', size: 11, weight: '600' }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

// Render the Main Planning dashboard coverage grid
function renderCoverageTable(naiveData, reconciledData) {
    const tbody = document.querySelector("#coverage-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const clusters = Object.keys(reconciledData).sort();
    
    const facilityMap = {
        "C-01": { id: "F-01", name: "District Central Hosp." },
        "C-02": { id: "F-02", name: "North Migrant Post" },
        "C-03": { id: "F-03", name: "East River Clinic" },
        "C-04": { id: "F-04", name: "Nomadic Station" },
        "C-05": { id: "F-05", name: "Highland Clinic" }
    };

    let priorityGapsCount = 0;
    
    clusters.forEach(cluster => {
        const rec = reconciledData[cluster];
        const n = naiveData[cluster] ? naiveData[cluster][currentVaccine] : null;
        const r = rec.vaccines[currentVaccine];
        
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/80 transition-colors";
        
        // Cluster name
        const tdCluster = document.createElement("td");
        tdCluster.className = "p-3.5 font-bold text-slate-900";
        tdCluster.innerHTML = cluster;
        tr.appendChild(tdCluster);
        
        // Serving Facility
        const tdFac = document.createElement("td");
        tdFac.className = "p-3.5";
        const facInfo = facilityMap[cluster] || { id: "N/A", name: "Outreach Team" };
        tdFac.innerHTML = `<span class="font-medium text-slate-800 block">${facInfo.name}</span><span class="text-[10px] text-slate-400 font-mono">${facInfo.id}</span>`;
        tr.appendChild(tdFac);
        
        // Naive population / catchment
        const tdCatchment = document.createElement("td");
        tdCatchment.className = "p-3.5 font-medium text-slate-700";
        tdCatchment.textContent = n ? n.catchment : "-";
        tr.appendChild(tdCatchment);
        
        // Reconciled population
        const tdReconciled = document.createElement("td");
        tdReconciled.className = "p-3.5 font-semibold text-slate-900";
        tdReconciled.textContent = rec.total_eligible;
        tr.appendChild(tdReconciled);
        
        // Naive rate
        const tdNaiveRate = document.createElement("td");
        tdNaiveRate.className = "p-3.5";
        if (n) {
            const pct = Math.round(n.rate * 100);
            tdNaiveRate.innerHTML = `
                <div class="flex items-center gap-2 w-32">
                    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div class="h-full bg-rose-500 rounded-full" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <span class="font-medium text-slate-600 w-8 text-right">${pct}%</span>
                </div>`;
        } else {
            tdNaiveRate.textContent = "-";
        }
        tr.appendChild(tdNaiveRate);
        
        // Reconciled rate (K-Anonymity checks)
        const tdReconciledRate = document.createElement("td");
        tdReconciledRate.className = "p-3.5";
        let reconciledPercentageVal = null;
        
        if (rec.privacy_status === "SUPPRESSED") {
            const kVal = document.getElementById("k-input").value || 10;
            tdReconciledRate.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200"><i class="fa-solid fa-user-lock text-slate-400"></i> SUPPRESSED (k &lt; ${kVal})</span>`;
        } else if (r) {
            reconciledPercentageVal = r.rate * 100;
            const pct = Math.round(reconciledPercentageVal);
            let barColor = "bg-rose-500";
            if (reconciledPercentageVal >= 80) barColor = "bg-emerald-500";
            else if (reconciledPercentageVal >= 50) barColor = "bg-amber-500";
            
            tdReconciledRate.innerHTML = `
                <div class="flex items-center gap-2 w-32">
                    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div class="h-full ${barColor} rounded-full" style="width: ${pct}%"></div>
                    </div>
                    <span class="font-bold text-slate-900 w-8 text-right">${pct}%</span>
                </div>`;
        } else {
            tdReconciledRate.textContent = "-";
        }
        tr.appendChild(tdReconciledRate);
        
        // Priority Gaps
        const tdPriority = document.createElement("td");
        tdPriority.className = "p-3.5";
        if (rec.privacy_status === "SUPPRESSED") {
            tdPriority.innerHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">N/A</span>`;
        } else if (reconciledPercentageVal !== null) {
            if (reconciledPercentageVal < 50) {
                priorityGapsCount++;
                tdPriority.innerHTML = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"><i class="fa-solid fa-triangle-exclamation"></i> Critical Gap</span>`;
            } else if (reconciledPercentageVal < 80) {
                priorityGapsCount++;
                tdPriority.innerHTML = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Outreach Need</span>`;
            } else {
                tdPriority.innerHTML = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Adequate</span>`;
            }
        } else {
            tdPriority.textContent = "-";
        }
        tr.appendChild(tdPriority);
        
        // Trust status column
        const tdTrust = document.createElement("td");
        tdTrust.className = "p-3.5";
        if (rec.trust_status === "TRUSTED") {
            tdTrust.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-circle-check"></i> Synced</span>`;
        } else {
            tdTrust.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200" title="${rec.trust_reason}"><i class="fa-solid fa-triangle-exclamation"></i> Outage Warning</span>`;
        }
        tr.appendChild(tdTrust);
        
        tbody.appendChild(tr);
    });

    const gapElement = document.getElementById("count-priority-gaps");
    if (gapElement) {
        gapElement.textContent = `${priorityGapsCount} Settlements`;
    }
}

// REST call: Get Review queue
async function fetchReviewQueue() {
    try {
        const res = await fetch("/api/dedup/review");
        const data = await res.json();
        
        const badge = document.getElementById("review-badge");
        if (badge) {
            badge.textContent = data.count;
        }
        
        renderReviewQueue(data.queue);
    } catch (err) {
        console.error("Error fetching review queue:", err);
    }
}

// Render Review items cards
function renderReviewQueue(queue) {
    const container = document.getElementById("review-queue-container");
    if (!container) return;
    container.innerHTML = "";
    
    if (queue.length === 0) {
        container.innerHTML = `
            <div class="p-12 rounded-2xl bg-white border border-slate-200/80 text-center space-y-3 shadow-xs">
                <i class="fa-solid fa-circle-check text-4xl text-teal-600"></i>
                <p class="text-sm font-semibold text-slate-800">Review queue is empty. No ambiguous match candidates detected!</p>
            </div>`;
        return;
    }
    
    queue.forEach(item => {
        const r1 = item.record_1;
        const r2 = item.record_2;
        const sims = item.details;
        const scorePct = Math.round(item.score * 100);
        
        const card = document.createElement("div");
        card.className = "card p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm review-item-card space-y-5";
        
        const checkFieldClass = (field, sim) => {
            const val1 = r1[field] || "";
            const val2 = r2[field] || "";
            if (!val1 || !val2) return "text-slate-700";
            return sim > 0.85 ? "text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded" : "text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded";
        };
        
        card.innerHTML = `
            <div class="flex justify-between items-center pb-4 border-b border-slate-100">
                <div class="flex items-center gap-3">
                    <span class="bg-teal-50 border border-teal-200 text-teal-800 font-heading font-extrabold text-base px-3 py-1 rounded-xl">${scorePct}%</span>
                    <div>
                        <strong class="text-sm font-bold text-slate-900 block">Fuzzy Linkage Match Candidate</strong>
                        <p class="text-[11px] text-slate-500">Fellegi-Sunter Weighted Classifier</p>
                    </div>
                </div>
                <span class="text-xs font-mono font-medium text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">Cluster ${r1.cluster_id}</span>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Record 1 -->
                <div class="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 space-y-2.5">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-teal-700 pb-2 border-b border-slate-200">Registration Record A</h4>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Record ID</span>
                        <span class="font-mono text-slate-800">${r1.child_id}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">First Name</span>
                        <span class="${checkFieldClass('first_name', sims.first_name)}">${r1.first_name}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Last Name</span>
                        <span class="${checkFieldClass('last_name', sims.last_name)}">${r1.last_name}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Date of Birth</span>
                        <span class="${checkFieldClass('dob', sims.dob)}">${r1.dob}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Gender</span>
                        <span class="${checkFieldClass('sex', sims.sex == 1 ? 1 : 0)}">${r1.sex}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Mother's Name</span>
                        <span class="${checkFieldClass('mother_name', sims.mother_name)}">${r1.mother_name || "Missing"}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Guardian Phone</span>
                        <span class="${checkFieldClass('phone', sims.phone)}">${r1.phone || "Missing"}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1">
                        <span class="text-slate-500">Facility Registered</span>
                        <span class="font-medium text-slate-800">${r1.facility_id}</span>
                    </div>
                </div>

                <!-- Record 2 -->
                <div class="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 space-y-2.5">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-sky-700 pb-2 border-b border-slate-200">Registration Record B</h4>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Record ID</span>
                        <span class="font-mono text-slate-800">${r2.child_id}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">First Name</span>
                        <span class="${checkFieldClass('first_name', sims.first_name)}">${r2.first_name}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Last Name</span>
                        <span class="${checkFieldClass('last_name', sims.last_name)}">${r2.last_name}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Date of Birth</span>
                        <span class="${checkFieldClass('dob', sims.dob)}">${r2.dob}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Gender</span>
                        <span class="${checkFieldClass('sex', sims.sex == 1 ? 1 : 0)}">${r2.sex}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Mother's Name</span>
                        <span class="${checkFieldClass('mother_name', sims.mother_name)}">${r2.mother_name || "Missing"}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1 border-b border-slate-200/50">
                        <span class="text-slate-500">Guardian Phone</span>
                        <span class="${checkFieldClass('phone', sims.phone)}">${r2.phone || "Missing"}</span>
                    </div>
                    <div class="flex justify-between text-xs py-1">
                        <span class="text-slate-500">Facility Registered</span>
                        <span class="font-medium text-slate-800">${r2.facility_id}</span>
                    </div>
                </div>
            </div>
            
            <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button class="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all" onclick="submitReviewAction('${r1.child_id}', '${r2.child_id}', 'SPLIT', this)">
                    <i class="fa-solid fa-user-plus text-slate-500"></i> Keep Separate (Distinct Children)
                </button>
                <button class="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all" onclick="submitReviewAction('${r1.child_id}', '${r2.child_id}', 'MERGE', this)">
                    <i class="fa-solid fa-link text-white"></i> Approve Merge (Same Child)
                </button>
            </div>`;
            
        container.appendChild(card);
    });
}

// POST review response
async function submitReviewAction(id1, id2, action, element) {
    const card = element.closest(".review-item-card");
    if (card) {
        card.classList.add("actioned");
    }
    
    try {
        const res = await fetch("/api/dedup/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                record_1_id: id1,
                record_2_id: id2,
                action: action
            })
        });
        const data = await res.json();
        
        if (data.status === "success") {
            setTimeout(() => {
                if (card) card.remove();
                fetchCoverage();
                fetchReviewQueue();
                fetchMetrics();
            }, 300);
        }
    } catch (err) {
        console.error("Error submitting review action:", err);
        if (card) card.classList.remove("actioned");
    }
}

// REST call: Perform Point-of-Care Search (PII check)
async function performPocSearch() {
    const queryInput = document.getElementById("poc-search-input");
    const isAuthInput = document.getElementById("auth-simulator-switch");
    const container = document.getElementById("poc-results-container");
    
    if (!queryInput || !container) return;
    
    const query = queryInput.value.trim();
    const isAuth = isAuthInput ? isAuthInput.checked : false;
    
    if (!query) {
        container.innerHTML = `
            <div class="p-12 rounded-2xl bg-white border border-slate-200/80 text-center space-y-3 shadow-xs">
                <i class="fa-solid fa-circle-exclamation text-4xl text-amber-500"></i>
                <p class="text-xs font-semibold text-slate-700">Please enter a search query term first.</p>
            </div>`;
        return;
    }
    
    container.innerHTML = `
        <div class="p-12 rounded-2xl bg-white border border-slate-200/80 text-center space-y-3 shadow-xs">
            <i class="fa-solid fa-spinner fa-spin text-4xl text-teal-600"></i>
            <p class="text-xs text-slate-500">Searching registration records...</p>
        </div>`;

    const headers = {};
    if (isAuth) {
        headers["X-User-Role"] = "field_worker";
    }

    try {
        const res = await fetch(`/api/field/verify?q=${encodeURIComponent(query)}`, {
            headers: headers
        });
        
        if (res.status === 403) {
            const errData = await res.json();
            container.innerHTML = `
                <div class="card p-6 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-4 text-rose-900 shadow-xs">
                    <i class="fa-solid fa-lock-open text-rose-600 text-2xl mt-1"></i>
                    <div>
                        <h4 class="font-bold text-sm text-rose-900">Access Denied: Privacy Protection Violation</h4>
                        <p class="text-xs text-rose-700 mt-1">${errData.detail}</p>
                    </div>
                </div>`;
            return;
        }
        
        const data = await res.json();
        renderPocResults(data.results);
    } catch (err) {
        console.error("Error during POC search:", err);
        container.innerHTML = `<div class="card p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs"><p>Failed to execute network request.</p></div>`;
    }
}

// Render search results for POC
function renderPocResults(results) {
    const container = document.getElementById("poc-results-container");
    if (!container) return;
    container.innerHTML = "";
    
    if (!results || results.length === 0) {
        container.innerHTML = `
            <div class="p-12 rounded-2xl bg-white border border-slate-200/80 text-center space-y-3 shadow-xs">
                <i class="fa-solid fa-user-slash text-4xl text-slate-300"></i>
                <p class="text-xs font-semibold text-slate-600">No matching patient records found.</p>
            </div>`;
        return;
    }
    
    results.forEach(item => {
        const demo = item.demographics;
        const card = document.createElement("div");
        card.className = "card p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-5";
        
        let duplicatesChipsHTML = "";
        if (item.linked_duplicates && item.linked_duplicates.length > 0) {
            duplicatesChipsHTML = `
                <div class="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 space-y-2">
                    <h4 class="text-xs font-bold text-amber-800 flex items-center gap-1.5"><i class="fa-solid fa-circle-nodes text-amber-600"></i> Linked Redundant Registrations (Deduplicated)</h4>
                    <div class="flex flex-wrap gap-2">
                        ${item.linked_duplicates.map(id => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-white text-amber-900 border border-amber-300 shadow-xs"><i class="fa-solid fa-id-badge text-amber-600 text-[10px]"></i> ID: ${id}</span>`).join("")}
                    </div>
                </div>`;
        }
        
        const allVaccines = ["BCG", "DTP1", "DTP2", "DTP3", "MCV1", "MCV2"];
        const administeredVacs = {};
        if (item.immunizations) {
            item.immunizations.forEach(im => {
                administeredVacs[im.vaccine] = im.date_administered;
            });
        }
        
        const timelineHTML = `
            <div class="space-y-3 pt-2">
                <h4 class="text-xs font-bold text-slate-800 flex items-center gap-2"><i class="fa-solid fa-clock-rotate-left text-teal-600"></i> Unified Immunization Registry History</h4>
                <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
                    ${allVaccines.map(vac => {
                        const adminDate = administeredVacs[vac];
                        if (adminDate) {
                            return `
                                <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center space-y-1">
                                    <i class="fa-solid fa-circle-check text-emerald-600 text-base"></i>
                                    <h5 class="text-xs font-bold text-emerald-900">${vac}</h5>
                                    <p class="text-[10px] text-emerald-700 font-medium">${adminDate}</p>
                                </div>`;
                        } else {
                            return `
                                <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center space-y-1">
                                    <i class="fa-solid fa-circle-xmark text-slate-400 text-base"></i>
                                    <h5 class="text-xs font-bold text-slate-600">${vac}</h5>
                                    <p class="text-[10px] text-slate-400">Due / Missed</p>
                                </div>`;
                        }
                    }).join("")}
                </div>
            </div>`;

        card.innerHTML = `
            <div class="flex justify-between items-start pb-4 border-b border-slate-100">
                <div>
                    <h3 class="font-heading text-lg font-bold text-slate-900">${demo.first_name} ${demo.last_name}</h3>
                    <span class="text-xs font-mono text-slate-500">Unified Registry Parent ID: ${item.unified_parent_id}</span>
                </div>
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200"><i class="fa-solid fa-shield-halved"></i> Active Record Profile</span>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <strong class="text-slate-400 block text-[10px] uppercase font-bold">Date of Birth</strong>
                    <span class="font-semibold text-slate-800">${demo.dob}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <strong class="text-slate-400 block text-[10px] uppercase font-bold">Gender</strong>
                    <span class="font-semibold text-slate-800">${demo.sex === 'M' ? 'Male' : 'Female'}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <strong class="text-slate-400 block text-[10px] uppercase font-bold">Guardian Contact</strong>
                    <span class="font-semibold text-slate-800">${demo.phone || "Not Recorded"}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <strong class="text-slate-400 block text-[10px] uppercase font-bold">Household ID</strong>
                    <span class="font-mono text-slate-800 font-semibold">${demo.household_id}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <strong class="text-slate-400 block text-[10px] uppercase font-bold">Settlement Cluster</strong>
                    <span class="font-semibold text-slate-800">Cluster ${demo.cluster_id}</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <strong class="text-slate-400 block text-[10px] uppercase font-bold">Primary Facility</strong>
                    <span class="font-semibold text-slate-800">${demo.facility_id}</span>
                </div>
            </div>
            
            ${duplicatesChipsHTML}
            ${timelineHTML}
        `;
        
        container.appendChild(card);
    });
}

// REST call: Fetch Experiment Metrics dashboard values
async function fetchMetrics() {
    try {
        const res = await fetch("/api/metrics");
        const data = await res.json();
        
        if (data.status === "no_ground_truth") {
            return;
        }

        const ded = data.dedup_metrics;
        const cov = data.coverage_metrics;
        
        const precVal = document.getElementById("val-precision");
        const recVal = document.getElementById("val-recall");
        if (precVal) precVal.textContent = `${(ded.precision * 100).toFixed(1)}%`;
        if (recVal) recVal.textContent = `${(ded.recall * 100).toFixed(1)}%`;
        
        const tblPrec = document.getElementById("table-precision");
        const tblRec = document.getElementById("table-recall");
        if (tblPrec) tblPrec.textContent = `${(ded.precision * 100).toFixed(1)}%`;
        if (tblRec) tblRec.textContent = `${(ded.recall * 100).toFixed(1)}%`;
        
        const gt_dtp3 = (cov.dtp3.ground_truth_rate * 100).toFixed(1);
        const naive_dtp3 = (cov.dtp3.naive_rate * 100).toFixed(1);
        const rec_dtp3 = (cov.dtp3.reconciled_rate * 100).toFixed(1);

        const valGtDtp3 = document.getElementById("val-gt-dtp3");
        const valNaiveDtp3 = document.getElementById("val-naive-dtp3");
        const valRecDtp3 = document.getElementById("val-rec-dtp3");

        if (valGtDtp3) valGtDtp3.textContent = `${gt_dtp3}%`;
        if (valNaiveDtp3) valNaiveDtp3.textContent = `${naive_dtp3}%`;
        if (valRecDtp3) valRecDtp3.textContent = `${rec_dtp3}%`;

        const barGtDtp3 = document.getElementById("bar-gt-dtp3");
        const barNaiveDtp3 = document.getElementById("bar-naive-dtp3");
        const barRecDtp3 = document.getElementById("bar-rec-dtp3");

        if (barGtDtp3) barGtDtp3.style.width = `${gt_dtp3}%`;
        if (barNaiveDtp3) barNaiveDtp3.style.width = `${Math.min(naive_dtp3, 100)}%`;
        if (barRecDtp3) barRecDtp3.style.width = `${rec_dtp3}%`;
        
        const naive_dtp3_err = (cov.dtp3.naive_error * 100);
        const rec_dtp3_err = (cov.dtp3.reconciled_error * 100);
        
        const tblNaiveDtp3Err = document.getElementById("table-naive-dtp3-err");
        const tblRecDtp3Err = document.getElementById("table-rec-dtp3-err");
        const tblDtp3Imp = document.getElementById("table-dtp3-improvement");

        if (tblNaiveDtp3Err) tblNaiveDtp3Err.innerHTML = `<span class="text-rose-600 font-bold">+${naive_dtp3_err.toFixed(1)}% (Inflated)</span>`;
        if (tblRecDtp3Err) tblRecDtp3Err.innerHTML = `<span class="${Math.abs(rec_dtp3_err) <= 5 ? 'text-teal-600 font-bold' : 'text-rose-600 font-bold'}">${rec_dtp3_err >= 0 ? '+' : ''}${rec_dtp3_err.toFixed(1)}%</span>`;
        if (tblDtp3Imp) tblDtp3Imp.textContent = `Error reduced by ${(Math.abs(naive_dtp3_err) - Math.abs(rec_dtp3_err)).toFixed(1)}%`;
        
        const naive_mcv1_err = (cov.mcv1.naive_error * 100);
        const rec_mcv1_err = (cov.mcv1.reconciled_error * 100);

        const tblNaiveMcv1Err = document.getElementById("table-naive-mcv1-err");
        const tblRecMcv1Err = document.getElementById("table-rec-mcv1-err");
        const tblMcv1Imp = document.getElementById("table-mcv1-improvement");

        if (tblNaiveMcv1Err) tblNaiveMcv1Err.innerHTML = `<span class="text-rose-600 font-bold">+${naive_mcv1_err.toFixed(1)}% (Inflated)</span>`;
        if (tblRecMcv1Err) tblRecMcv1Err.innerHTML = `<span class="${Math.abs(rec_mcv1_err) <= 5 ? 'text-teal-600 font-bold' : 'text-rose-600 font-bold'}">${rec_mcv1_err >= 0 ? '+' : ''}${rec_mcv1_err.toFixed(1)}%</span>`;
        if (tblMcv1Imp) tblMcv1Imp.textContent = `Error reduced by ${(Math.abs(naive_mcv1_err) - Math.abs(rec_mcv1_err)).toFixed(1)}%`;
        
    } catch (err) {
        console.error("Error loading metrics view:", err);
    }
}
