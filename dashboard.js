function destroyAllCharts() {
    // Destroy all existing Chart.js instances
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    charts = {}; // Reset the charts object
}

document.addEventListener("DOMContentLoaded", async () => {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "auth.html"; // Redirect to login
        return;
    }

    try {
        let response = await fetch("http://127.0.0.1:5000/auth/user", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            localStorage.removeItem("token");
            window.location.href = "auth.html";
            return;
        }

        let userData = await response.json();
        document.getElementById("welcome-message").textContent = `Welcome, ${userData.full_name}`;
        displayDashboard(userData.role);
    } catch (error) {
        localStorage.removeItem("token");
        window.location.href = "auth.html";
    }
});

function displayDashboard(role) {
    const sections = {
        player: document.getElementById("player-dashboard"),
        coach: document.getElementById("coach-dashboard"),
        physio: document.getElementById("physio-dashboard"),
        trainer: document.getElementById("trainer-dashboard"),
    };

    Object.values(sections).forEach(section => section.classList.add("hidden"));
    if (sections[role]) {
        sections[role].classList.remove("hidden");
        loadData(role);
    }
}

async function loadData(role) {
    const token = localStorage.getItem("token");

    try {
        let response = await fetch(`http://127.0.0.1:5000/auth/dashboard/${role}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) throw new Error("Failed to load data");

        let data = await response.json();
        console.log("API Response:", data);
        populateDashboard(role, data);  // This now calls the properly defined function
    } catch (error) {
        console.error("Error loading dashboard data:", error);
    }
}

// ADD THIS NEW FUNCTION
function populateDashboard(role, data) {
    switch (role) {
        case "player":
            populatePlayerDashboard(data);
            break;
        case "coach":
            populateCoachDashboard(data);
            break;
        case "physio":
            populatePhysioDashboard(data);
            break;
        case "trainer":
            populateTrainerDashboard(data);
            break;
        default:
            console.error("Unknown role:", role);
    }
}

// Existing populatePlayerDashboard remains the same
let charts = {}; // To store chart instances

async function populatePlayerDashboard(data) {
    destroyAllCharts();

    // Update staff information
    document.getElementById('staff-coach').textContent = data.staff.coach || 'Not assigned';
    document.getElementById('staff-physio').textContent = data.staff.physio || 'Not assigned';
    document.getElementById('staff-trainer').textContent = data.staff.trainer || 'Not assigned';

    const injury = data.injury_details;

    if (injury && injury.is_active) {
        // Display injury details
        document.getElementById('injury-type').textContent = injury.injury_type;
        document.getElementById('injury-severity').textContent = injury.severity;
        document.getElementById('injury-recovery-date').textContent = injury.estimated_recovery_date;

        // Calculate progress based on injury_date and estimated_recovery_date
        const injuryDate = new Date(injury.injury_date);
        const recoveryDate = new Date(injury.estimated_recovery_date);
        const today = new Date();
        const totalDays = (recoveryDate - injuryDate) / (1000 * 3600 * 24);
        const daysPassed = (today - injuryDate) / (1000 * 3600 * 24);
        const progress = Math.min((daysPassed / totalDays) * 100, 100);
        document.getElementById('recovery-progress').style.width = `${progress}%`;

        // Set status indicator to injured
        const indicator = document.getElementById('injury-status-indicator');
        indicator.textContent = 'Injured';
        indicator.className = 'injured';
    } else {
        // When no active injury is reported
        document.getElementById('injury-type').textContent = 'No active injuries';
        document.getElementById('injury-severity').textContent = '';
        document.getElementById('injury-recovery-date').textContent = '';
        document.getElementById('recovery-progress').style.width = '0%';

        const indicator = document.getElementById('injury-status-indicator');
        indicator.textContent = 'Healthy';
        indicator.className = 'healthy';
    }

    // Mini Charts
    renderPerformanceMetrics(data.performance);
    renderActivityData(data.tracker);
    renderNutritionBreakdown(data.nutrition);
    renderTrainingSessions(data.training_sessions);

    try {
        const profileResponse = await fetch('http://127.0.0.1:5000/auth/player-profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const profileData = await profileResponse.json();
        console.log("Profile Data:", profileData);

        if (!profileData.exists) {
            console.log("Profile missing, showing modal");
            document.getElementById('profile-modal').classList.remove('hidden');
        } else {
            console.log("Profile exists, adding personal info");
            const personalInfo = `
                <div class="personal-info">
                    <h3>Personal Information</h3>
                    <div class="info-grid">
                        <div>Full Name: ${profileData.full_name}</div>
                        <div>Email: ${profileData.email}</div>
                        <div>Age: ${profileData.age}</div>
                        <div>Height: ${profileData.height_cm} cm</div>
                        <div>Weight: ${profileData.weight_kg} kg</div>
                        <div>DOB: ${new Date(profileData.date_of_birth).toLocaleDateString()}</div>
                        <div>Position: ${profileData.position}</div>
                        <div>Gender: ${profileData.gender}</div>
                    </div>
                </div>
            `;
            document.querySelector('#player-dashboard h2').insertAdjacentHTML('afterend', personalInfo);
        }
    } catch (error) {
        console.error('Error fetching profile:', error);
    }
}
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const profileData = {
        height_cm: document.getElementById('height').value,
        weight_kg: document.getElementById('weight').value,
        date_of_birth: document.getElementById('dob').value,
        position: document.getElementById('position').value,
        gender: document.getElementById('gender').value
    };

    try {
        const response = await fetch('http://127.0.0.1:5000/auth/player-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(profileData)
        });

        if (response.ok) {
            document.getElementById('profile-modal').classList.add('hidden');
            loadData('player'); // Refresh dashboard
        }
    } catch (error) {
        console.error('Error saving profile:', error);
    }
});
function renderPerformanceMetrics(performanceData) {
    const ctx = document.getElementById('performance-chart');
    const latest = performanceData[0] || {};

    // Radar chart configuration
    charts.performance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Speed', 'Endurance', 'Agility', 'Stamina'],
            datasets: [{
                label: 'Performance Metrics',
                data: [
                    latest.speed / 5 || 0,
                    latest.endurance || 0,
                    latest.agility || 0,
                    latest.stamina || 0
                ],
                backgroundColor: 'rgba(0, 128, 0, 0.2)',
                borderColor: 'green',
                pointBackgroundColor: 'green',
                pointBorderColor: '#fff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 10,
                    ticks: {
                        display: false
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

let currentMetricIndex = 0;
const metricConfig = {
    steps: { label: 'Steps Taken', color: '#4CAF50', key: 'steps_taken' },
    heart: { label: 'Heart Rate', color: '#FF5722', key: 'heart_rate' },
    distance: { label: 'Distance (km)', color: '#2196F3', key: 'distance_covered' }
};

function renderActivityData(trackerData) {
    destroyActivityCharts();

    // Render all three charts
    renderActivityChart('steps', trackerData);
    renderActivityChart('heart', trackerData);
    renderActivityChart('distance', trackerData);

    // Show initial active chart
    updateActiveMetricDisplay();
}

function renderActivityChart(metric, data) {
    const config = metricConfig[metric];
    const ctx = document.getElementById(`activity-${metric}-chart`);
    const labels = data.map((_, i) => `Week ${i + 1}`);

    charts[`activity-${metric}`] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: config.label,
                data: data.map(d => d[config.key]).reverse(),
                borderColor: config.color,
                tension: 0.3,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: true } },
            scales: {
                y: { display: true, beginAtZero: true },
                x: { display: true }
            }
        }
    });
}

function destroyActivityCharts() {
    ['steps', 'heart', 'distance'].forEach(metric => {
        if (charts[`activity-${metric}`]) {
            charts[`activity-${metric}`].destroy();
            delete charts[`activity-${metric}`];
        }
    });
}

function switchMetric(direction) {
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');

    // Update index
    currentMetricIndex = (currentMetricIndex + direction + indicators.length) % indicators.length;
    currentMetricIndex = (currentMetricIndex + direction + slides.length) % slides.length;

    // Update display
    updateActiveMetricDisplay();
}

function updateActiveMetricDisplay() {
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.indicator');
    const metrics = ['steps', 'heart', 'distance'];

    slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === currentMetricIndex);
    });

    indicators.forEach((indicator, index) => {
        indicator.classList.toggle('active', index === currentMetricIndex);
    });

    // Update chart sizes
    setTimeout(() => {
        metrics.forEach(metric => {
            if (charts[`activity-${metric}`]) {
                charts[`activity-${metric}`].resize();
            }
        });
    }, 300);
}

function renderNutritionBreakdown(nutritionData) {
    const ctx = document.getElementById('nutrition-chart');
    const latest = nutritionData[0] || {};

    charts.nutrition = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Protein', 'Carbs', 'Fat'],
            datasets: [{
                data: [
                    latest.protein_intake || 0,
                    latest.carbs_intake || 0,
                    latest.fat_intake || 0
                ],
                backgroundColor: ['#4aae52', '#a4d3b0', '#d1ffe8']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value} g`; // Adding units here
                        }
                    }
                }
            }
        }
    });
}

function renderTrainingSessions(sessions) {
    const container = document.getElementById('training-sessions-list');
    container.innerHTML = '';

    if (sessions.length === 0) {
        container.innerHTML = '<p>No training sessions recorded</p>';
        return;
    }

    sessions.forEach(session => {
        const div = document.createElement('div');
        div.className = 'session-item';

        // Format date (e.g., "Oct 15, 2023")
        const sessionDate = new Date(session.session_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        div.innerHTML = `
            <div class="session-info">
                <div class="session-type">${session.session_type}</div>
                <div class="session-date">${sessionDate}</div>
            </div>
            <div class="session-stats">
                <span>${session.duration} mins</span>
                <span>${session.calories_burned} kcal</span>
            </div>
        `;
        container.appendChild(div);
    });
}
// Coach Dashboard Functions
function populateCoachDashboard(data) {
    const container = document.getElementById('assigned-players-container');
    container.innerHTML = '';

    // Add summary cards
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'coach-summary-container';
    summaryContainer.innerHTML = `
        <div class="summary-card total">
            <i class="fas fa-users"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.total_players}</span>
                <span class="summary-label">Assigned Players</span>
            </div>
        </div>
        <div class="summary-card injured">
            <i class="fas fa-band-aid"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.injured_count}</span>
                <span class="summary-label">Injured Players</span>
            </div>
        </div>
        <div class="summary-card healthy">
            <i class="fas fa-heart"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.healthy_count}</span>
                <span class="summary-label">Healthy Players</span>
            </div>
        </div>
    `;
    container.parentNode.insertBefore(summaryContainer, container);

    // Existing player cards
    if (data.assigned_players.length === 0) {
        container.innerHTML = '<p>No assigned players yet.</p>';
        return;
    }

    data.assigned_players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
          <h4>${player.full_name}</h4>
          <div class="player-stats">
            <div class="stat-item">
              <span>Last Performance Check:</span>
              <span>${player.last_performance ? new Date(player.last_performance).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div class="stat-item">
              <span>Last Training Session:</span>
              <span>${player.last_training ? new Date(player.last_training).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div class="injury-status-coach ${player.is_injured ? 'injured' : 'healthy'}">
              ${player.is_injured ? 'Injured' : 'Healthy'}
            </div>
          </div>
        `;
        // Open the coach modal on click
        card.addEventListener("click", () => {
            openCoachPlayerModal(player);
        });
        container.appendChild(card);
    });
}
function openCoachPlayerModal(player) {
    // Populate coach modal fields with player data
    document.getElementById('coach-player-name').textContent = player.full_name;
    document.getElementById('coach-player-age').textContent = player.age || 'N/A';
    document.getElementById('coach-player-gender').textContent = player.gender || 'N/A';
    document.getElementById('coach-player-email').textContent = player.email || 'N/A';
    document.getElementById('coach-player-performance').textContent = player.last_performance
        ? new Date(player.last_performance).toLocaleDateString()
        : 'N/A';
    document.getElementById('coach-player-training').textContent = player.last_training
        ? new Date(player.last_training).toLocaleDateString()
        : 'N/A';

    // Injury status: using the is_injured count from backend
    const injuryStatus = player.is_injured > 0 ? 'Injured' : 'Healthy';
    document.getElementById('coach-player-injury-status').textContent = injuryStatus;

    // Populate injury history list
    const historyElem = document.getElementById('coach-player-injury-history');
    historyElem.innerHTML = '';
    if (player.injuries && player.injuries.length > 0) {
        player.injuries.forEach((injury, index) => {
            historyElem.innerHTML += `
                <li>
                  ${index + 1}. ${injury.type || 'N/A'} - ${injury.severity || 'N/A'}
                  (${injury.injury_date ? new Date(injury.injury_date).toLocaleDateString() : 'N/A'} → 
                  ${injury.recovery_date ? new Date(injury.recovery_date).toLocaleDateString() : 'N/A'})
                </li>
            `;
        });
    } else {
        historyElem.innerHTML = '<li>No injury history</li>';
    }

    // --- ML Recommendations for Coach --- //
    const ml = player.ml_recommendations || {};
    document.getElementById('coach-injury-risk').textContent = ml.injury_risk || 'N/A';
    document.getElementById('coach-intensity-change').textContent = ml.intensity_change || 'N/A';
    document.getElementById('coach-other-recommendations').textContent = ml.other_recommendations || 'N/A';

    // Show the coach modal
    const modal = document.getElementById('coach-player-modal');
    modal.classList.remove('hidden');

    // Set up the close button
    document.getElementById('close-coach-player-modal').onclick = () => {
        modal.classList.add('hidden');
    };
}


// Assignment Modal Handling

document.getElementById('confirm-assign').addEventListener('click', async () => {
    const playerId = document.getElementById('player-select').value;
    const activeSection = document.querySelector('.dashboard-section:not(.hidden)');
    const role = activeSection ? activeSection.id.split('-')[0] : null;

    if (!playerId || !role) return;

    try {
        const endpointMap = {
            coach: '/auth/dashboard/coach/assign-player',
            physio: '/auth/dashboard/physio/assign-player',
            trainer: '/auth/dashboard/trainer/assign-player'
        };

        const response = await fetch(`http://127.0.0.1:5000${endpointMap[role]}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ player_id: playerId })
        });

        if (response.ok) {
            document.getElementById('assignment-modal').classList.add('hidden');
            loadData(role);
        }
    } catch (error) {
        console.error('Assignment failed:', error);
    }
});


// Add this inside DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
    // Open Modal
    document.getElementById("add-player-btn").addEventListener("click", async () => {
        const modal = document.getElementById("assignment-modal");
        const select = document.getElementById("player-select");

        try {
            // Fetch available players
            const response = await fetch("http://127.0.0.1:5000/auth/dashboard/coach/available-players", {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`,
                },
            });

            if (!response.ok) throw new Error("Failed to fetch players");

            const players = await response.json();

            // Populate dropdown
            select.innerHTML = players.length > 0
                ? '<option value="">Select a player...</option>'
                : '<option value="">No players available</option>';

            players.forEach(player => {
                const option = document.createElement("option");
                option.value = player.id;
                option.textContent = player.full_name;
                select.appendChild(option);
            });

            // Show modal
            modal.classList.add("visible");

        } catch (error) {
            console.error("Error:", error);
            select.innerHTML = '<option value="">Error loading players</option>';
        }
    });

    // Close Modal
    document.querySelector(".close").addEventListener("click", () => {
        document.getElementById("assignment-modal").classList.remove("visible");
    });
});

let selectedPatientId = null;
// Physio Dashboard Functions
function populatePhysioDashboard(data) {
    const container = document.getElementById('assigned-patients-container');
    container.innerHTML = '';

    // Add summary cards
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'physio-summary-container';
    summaryContainer.innerHTML = `
        <div class="summary-card total">
            <i class="fas fa-procedures"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.total_players}</span>
                <span class="summary-label">Assigned Patients</span>
            </div>
        </div>
        <div class="summary-card critical">
            <i class="fas fa-exclamation-triangle"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.active_injuries}</span>
                <span class="summary-label">Active Injuries</span>
            </div>
        </div>
        <div class="summary-card recovering">
            <i class="fas fa-heartbeat"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.inactive_injuries}</span>
                <span class="summary-label">Healthy Players</span>
            </div>
        </div>
    `;
    container.parentNode.insertBefore(summaryContainer, container);


    if (data.assigned_players.length === 0) {
        container.innerHTML = '<p>No assigned patients yet.</p>';
        return;
    }

    data.assigned_players.forEach(patient => {
        const card = document.createElement('div');
        card.className = 'patient-card';

        // Display basic info (you can adjust as needed)
        let injuriesHTML = '<p class="no-injuries">No injury history</p>';
        if (patient.injuries.length > 0) {
            const latestInjury = patient.injuries[0]; // Get only the most recent injury
            injuriesHTML = `
        <div class="injury-item ${latestInjury.is_active ? 'active' : ''}">
            <div class="injury-header">
                <span class="injury-type">${latestInjury.type}</span>
                <span class="injury-severity">${latestInjury.severity}</span>
            </div>
            <div class="injury-dates">
                <span>${new Date(latestInjury.injury_date).toLocaleDateString()}</span>
                <span>→</span>
                <span>${new Date(latestInjury.recovery_date).toLocaleDateString()}</span>
            </div>
        </div>
    `;
        }


        card.innerHTML = `
            <h4>${patient.full_name}</h4>
            <div class="patient-details">
                <div class="injury-history">
                    <h5>Recent Injury</h5>
                    ${injuriesHTML}
                </div>
            </div>
        `;
        // Make the card clickable
        card.addEventListener("click", () => {
            openPlayerDetailsModal(patient);
        });
        container.appendChild(card);
    });
}
let selectedPlayerId = null; // Store selected player ID globally

function openPlayerDetailsModal(player) {
    // Populate physio modal fields with player data
    document.getElementById('physio-player-name').textContent = player.full_name;
    document.getElementById('physio-player-age').textContent = player.age || 'N/A';
    document.getElementById('physio-player-gender').textContent = player.gender || 'N/A';
    document.getElementById('physio-player-email').textContent = player.email || 'N/A';
    document.getElementById('physio-player-height').textContent = player.height || 'N/A';
    document.getElementById('physio-player-weight').textContent = player.weight || 'N/A';
    document.getElementById('physio-player-position').textContent = player.position || 'N/A';

    // --- ML Recommendations for Physio --- //
    const mr = player.ml_recommendations || {};
    document.getElementById('physio-injury-risk').textContent = mr.injury_risk || 'N/A';
    document.getElementById('physio-protein-change').textContent = mr.protein_change || 'N/A';
    document.getElementById('physio-carbs-change').textContent = mr.carbs_change || 'N/A';
    document.getElementById('physio-fat-change').textContent = mr.fat_change || 'N/A';

    // Store selected player ID for injury addition
    selectedPlayerId = player.id;

    // Show the physio modal
    const modal = document.getElementById('physio-player-modal');
    modal.classList.remove('hidden');

    // Set up the close button for physio modal
    document.getElementById('close-physio-player-modal').onclick = () => {
        modal.classList.add('hidden');
    };

    // ✅ Add functionality for "Add Injury" button
    document.getElementById('add-injury-btn').onclick = openAddInjuryModal;
    document.getElementById('add-nutrition-btn').onclick = openAddNutritionModal;
}

function openAddInjuryModal() {
    // Ensure a player is selected before opening the modal
    if (!selectedPlayerId) {
        alert("Error: No player selected.");
        return;
    }

    // Open the Add Injury Modal
    const injuryModal = document.getElementById('add-injury-modal');
    injuryModal.classList.remove('hidden');

    // Pre-fill the modal with player name
    document.getElementById('injury-player-name').textContent = document.getElementById('physio-player-name').textContent;

    // Ensure form submission works correctly
    document.getElementById('add-injury-form').onsubmit = async function (event) {
        event.preventDefault(); // Prevent default form submission

        // Collect form data
        const injuryData = {
            player_id: selectedPlayerId,  // ✅ Make sure player_id is included
            injury_type: document.getElementById('injury-type-input').value,
            severity: document.getElementById('injury-severity-input').value,
            recovery_time: document.getElementById('injury-recovery-time').value,
            injury_date: document.getElementById('injury-date-input').value
        };

        try {
            const response = await fetch("auth/dashboard/physio/add-injury", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}` // ✅ Ensure JWT is included
                },
                body: JSON.stringify(injuryData)
            });

            const result = await response.json();
            if (response.ok) {
                alert("Injury added successfully!");
                injuryModal.classList.add('hidden'); // Close the modal
            } else {
                alert(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error("Error adding injury:", error);
            alert("Failed to add injury. Try again.");
        }
    };

    // Close Add Injury Modal when the close button is clicked
    document.getElementById('close-add-injury').onclick = () => {
        injuryModal.classList.add('hidden');
    };
}

function openAddNutritionModal() {
    if (!selectedPlayerId) {
        alert("Error: No player selected.");
        return;
    }

    const nutritionModal = document.getElementById('add-nutrition-modal');
    nutritionModal.classList.remove('hidden');

    document.getElementById('nutrition-player-name').textContent = document.getElementById('physio-player-name').textContent;

    document.getElementById('add-nutrition-form').onsubmit = async function (event) {
        event.preventDefault(); // Prevent default form submission

        const nutritionData = {
            player_id: selectedPlayerId,
            diet_plan: document.getElementById('nutrition-diet-plan').value,
            calories_per_day: document.getElementById('nutrition-calories-per-day').value,
            protein_intake: document.getElementById('nutrition-protein-intake').value,
            carbs_intake: document.getElementById('nutrition-carbs-intake').value,
            fat_intake: document.getElementById('nutrition-fat-intake').value,
            created_at: document.getElementById('nutrition-created-at').value
        };

        try {
            const response = await fetch("auth/dashboard/physio/add-nutrition", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(nutritionData)
            });

            const result = await response.json();
            if (response.ok) {
                alert("Nutrition added successfully!");
                nutritionModal.classList.add('hidden');
            } else {
                alert(`Error: ${result.error}`);
            }
        } catch (error) {
            console.error("Error adding nutrition:", error);
            alert("Failed to add nutrition. Try again.");
        }
    };

    document.getElementById('close-add-nutrition').onclick = () => {
        nutritionModal.classList.add('hidden');
    };
}

function calculateRecoveryProgress(injury) {
    const start = new Date(injury.injury_date);
    const end = new Date(injury.recovery_date);
    const today = new Date();

    const total = end - start;
    const passed = today - start;

    return Math.min(Math.max(Math.round((passed / total) * 100), 0), 100);
}

// Add event listeners for physio modal
document.addEventListener("DOMContentLoaded", () => {
    // Physio Assign Patient
    document.getElementById("add-patient-btn").addEventListener("click", async () => {
        const modal = document.getElementById("assignment-modal");
        const select = document.getElementById("player-select");

        try {
            const response = await fetch("http://127.0.0.1:5000/auth/dashboard/physio/available-players", {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`,
                },
            });

            if (!response.ok) throw new Error("Failed to fetch players");

            const players = await response.json();

            select.innerHTML = players.length > 0
                ? '<option value="">Select a patient...</option>'
                : '<option value="">No patients available</option>';

            players.forEach(player => {
                const option = document.createElement("option");
                option.value = player.id;
                option.textContent = player.full_name;
                select.appendChild(option);
            });

            modal.classList.add("visible");

        } catch (error) {
            console.error("Error:", error);
            select.innerHTML = '<option value="">Error loading patients</option>';
        }
    });

    // Update confirm assign handler
    document.getElementById('confirm-assign').addEventListener('click', async () => {
        const playerId = document.getElementById('player-select').value;
        const role = document.querySelector('.dashboard-section:not(.hidden)').id.split('-')[0];

        if (!playerId) return;

        try {
            const endpoint = {
                'coach': '/auth/dashboard/coach/assign-player',
                'physio': '/auth/dashboard/physio/assign-player',
                'trainer': '/auth/dashboard/trainer/assign-player'
            }[role];

            if (!endpoint) throw new Error('Invalid role');

            const response = await fetch(`http://127.0.0.1:5000${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ player_id: playerId })
            });

            if (response.ok) {
                document.getElementById('assignment-modal').classList.add('hidden');
                loadData(role);
            }
        } catch (error) {
            console.error('Assignment failed:', error);
        }
    });
});
// Trainer Dashboard Functions
let trainerClients = [];

function populateTrainerDashboard(data) {
    const container = document.getElementById('assigned-clients-container');
    const summaryContainer = document.getElementById('trainer-summary');

    // Clear existing content
    container.innerHTML = '';
    summaryContainer.innerHTML = '';

    // Add summary cards (your existing code)
    summaryContainer.innerHTML = `
        <div class="summary-card-trainer total">
            <i class="fas fa-users"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.total_players}</span>
                <span class="summary-label">Assigned Athletes</span>
            </div>
        </div>
        <div class="summary-card-trainer active">
            <i class="fas fa-running"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.active_players}</span>
                <span class="summary-label">Active This Week</span>
            </div>
        </div>
        <div class="summary-card-trainer distance">
            <i class="fas fa-route"></i>
            <div class="summary-content">
                <span class="summary-value">${data.summary.avg_distance.toFixed(1)}km</span>
                <span class="summary-label">Avg Distance</span>
            </div>
        </div>
    `;

    // Store trainer clients for later use in detailed modal
    trainerClients = data.assigned_players;

    // Create client cards
    if (trainerClients.length === 0) {
        container.innerHTML = '<p>No assigned athletes yet.</p>';
        return;
    }

    trainerClients.forEach(client => {
        const card = document.createElement('div');
        card.className = 'client-card';
        card.innerHTML = `
            <div class="client-header">
                <h4>${client.full_name}</h4>
                <div class="client-stats">
                    <span>Last Training: ${client.last_training ? new Date(client.last_training).toLocaleDateString() : 'N/A'}</span>
                    <span>Avg Distance: ${client.avg_distance ? client.avg_distance.toFixed(1) + 'km' : 'N/A'}</span>
                </div>
            </div>
            <div class="performance-metrics">
                <button onclick="viewDetailedMetrics('${client.id}')">View Detailed Metrics</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function viewDetailedMetrics(clientId) {
    // Look up the client details in the stored trainerClients array
    const client = trainerClients.find(c => c.id === clientId);
    if (!client) {
        alert("Client data not found.");
        return;
    }
    // Populate basic metrics
    document.getElementById('metrics-client-age').textContent = client.age;
    document.getElementById('metrics-client-height').textContent = client.height;
    document.getElementById('metrics-client-weight').textContent = client.weight;
    document.getElementById('metrics-client-gender').textContent = client.gender;
    document.getElementById('metrics-client-injury-status').textContent = client.injury_status;
    document.getElementById('metrics-client-name').textContent = client.full_name;
    document.getElementById('metrics-last-training').textContent = client.last_training
        ? new Date(client.last_training).toLocaleDateString()
        : 'N/A';
    document.getElementById('metrics-last-performance').textContent = client.last_performance_check
        ? new Date(client.last_performance_check).toLocaleDateString()
        : 'N/A';

    // --- ML Recommendations for Trainer --- //
    const ml = client.ml_recommendations || {};
    document.getElementById('trainer-intensity-change').textContent = ml.intensity_change || 'N/A';
    document.getElementById('trainer-other-recommendations').textContent = ml.other_recommendations || 'N/A';

    selectedPlayerId = client.id;

    // Show the trainer detailed metrics modal
    const modal = document.getElementById('detailed-metrics-modal');
    modal.classList.remove('hidden');

    // Set up close button for the trainer modal
    document.getElementById('close-detailed-metrics').onclick = () => {
        modal.classList.add('hidden');
    };
    document.getElementById('add-performance-btn').onclick = openAddPerformanceModal;
    document.getElementById('add-tracker-btn').onclick = openAddTrackerModal;
    document.getElementById('add-session-btn').onclick = openAddSessionModal;
}


// Close the trainer detailed metrics modal when its close button is clicked
document.getElementById('close-detailed-metrics').onclick = function () {
    document.getElementById('detailed-metrics-modal').classList.add('hidden');
};

function openAddPerformanceModal() {
    if (!selectedPlayerId) {
        alert("Error: No player selected.");
        return;
    }

    const performanceModal = document.getElementById("add-performance-modal");
    performanceModal.classList.remove("hidden");

    document.getElementById('performance-player-name').textContent = document.getElementById('metrics-client-name').textContent;

    document.getElementById("add-performance-form").onsubmit = async function (event) {
        event.preventDefault(); // Prevent default form submission

        const performanceData = {
            player_id: selectedPlayerId,
            speed: document.getElementById("performance-speed").value,
            endurance: document.getElementById("performance-endurance").value,
            agility: document.getElementById("performance-agility").value,
            stamina: document.getElementById("performance-stamina").value,
            recorded_at: document.getElementById("performance-recorded-at").value
        };

        try {
            const response = await fetch("http://127.0.0.1:5000/auth/dashboard/trainer/add-performance", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(performanceData)
            });

            const result = await response.json();

            if (response.ok) {
                alert("Performance data added succesfully!");
                performanceModal.classList.add("hidden");
            } else {
                alert(result.error || "Failed to add performance data.");
            }
        } catch (error) {
            console.error("Error adding performance data:", error);
            alert("Failed to add performance data.");
        }
    };
}

function openAddTrackerModal() {
    if (!selectedPlayerId) {
        alert("Error: No player selected.");
        return;
    }

    const trackerModal = document.getElementById("add-tracker-modal");
    trackerModal.classList.remove("hidden");

    document.getElementById('tracker-player-name').textContent = document.getElementById('metrics-client-name').textContent;

    document.getElementById("add-tracker-form").onsubmit = async function (event) {
        event.preventDefault(); // Prevent default form submission

        const trackerData = {
            player_id: selectedPlayerId,
            heart_rate: document.getElementById("tracker-heart-rate").value,
            steps_taken: document.getElementById("tracker-steps-taken").value,
            distance_covered: document.getElementById("tracker-distance-covered").value,
            recorded_at: document.getElementById("tracker-recorded-at").value
        };

        try {
            const response = await fetch("http://127.0.0.1:5000/auth/dashboard/trainer/add-tracker", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(trackerData)
            });

            const result = await response.json();

            if (response.ok) {
                alert("Tracker data added succesfully!");
                trackerModal.classList.add("hidden");
            } else {
                alert(result.error || "Failed to add tracker data.");
            }
        } catch (error) {
            console.error("Error adding tracker data:", error);
            alert("Failed to add tracker data.");
        }
    };
}

function openAddSessionModal() {
    if (!selectedPlayerId) {
        alert("Error: No player selected.");
        return;
    }

    const sessionModal = document.getElementById("add-session-modal");
    sessionModal.classList.remove("hidden");

    document.getElementById('session-player-name').textContent = document.getElementById('metrics-client-name').textContent;

    document.getElementById("add-session-form").onsubmit = async function (event) {
        event.preventDefault(); // Prevent default form submission

        const sessionData = {
            player_id: selectedPlayerId,
            session_type: document.getElementById("session-type").value,
            duration: document.getElementById("session-duration").value,
            calories_burned: document.getElementById("session-calories-burned").value,
            intensity: document.getElementById("session-intensity").value,
            session_date: document.getElementById("session-date").value
        };

        try {
            const response = await fetch("http://127.0.0.1:5000/auth/dashboard/trainer/add-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(sessionData)
            });

            const result = await response.json();

            if (response.ok) {
                alert("Session data added succesfully!");
                sessionModal.classList.add("hidden");
            } else {
                alert(result.error || "Failed to add session data.");
            }
        } catch (error) {
            console.error("Error adding session data:", error);
            alert("Failed to add session data.");
        }
    };
}
// Update modal handler
document.addEventListener("DOMContentLoaded", () => {
    // Trainer Assign Client
    document.getElementById("add-client-btn").addEventListener("click", async () => {
        const modal = document.getElementById("assignment-modal");
        const select = document.getElementById("player-select");

        try {
            const response = await fetch("http://127.0.0.1:5000/auth/dashboard/trainer/available-players", {
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`,
                },
            });

            if (!response.ok) throw new Error("Failed to fetch clients");

            const players = await response.json();

            select.innerHTML = players.length > 0
                ? '<option value="">Select a client...</option>'
                : '<option value="">No clients available</option>';

            players.forEach(player => {
                const option = document.createElement("option");
                option.value = player.id;
                option.textContent = player.full_name;
                select.appendChild(option);
            });

            modal.classList.add("visible");

        } catch (error) {
            console.error("Error:", error);
            select.innerHTML = '<option value="">Error loading clients</option>';
        }
    });
});


document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "auth.html";
});