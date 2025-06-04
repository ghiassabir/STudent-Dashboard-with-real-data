// --- Constants for Data Files ---
const AGGREGATED_SCORES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSySYBO9YL3N4aUG3JEYZMQQIv9d1oSm3ba4Ty9Gt4SsGs2zmTS_k81rH3Qv41mZvClnayNcDpl_QbI/pub?gid=1890969747&single=true&output=csv';
const QUESTION_DETAILS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSySYBO9YL3N4aUG3JEYZMQQIv9d1oSm3ba4Ty9Gt4SsGs2zmTS_k81rH3Qv41mZvClnayNcDpl_QbI/pub?gid=822014112&single=true&output=csv';

// This will hold the processed data for the logged-in student
let currentStudentData = {};
let allAggregatedData = []; // To hold all students' aggregated data for class average calculations if needed client-side
let allQuestionDetailsData = []; // To hold all students' question details

// --- Date Formatting Helper ---
function formatDate(dateString) {
    if (!dateString || dateString === "N/A" || dateString === "Not Attempted" || dateString.toLowerCase().includes("invalid date")) return "N/A";
    try {
        // Handle potential full datetime strings from Apps Script
        let cleanedDateString = dateString;
        if (dateString.includes(" GMT")) {
            cleanedDateString = dateString.substring(0, dateString.indexOf(" GMT"));
        }
        const date = new Date(cleanedDateString);
        if (isNaN(date.getTime())) { // Check if date is valid
             // Try parsing as YYYY-MM-DD if it failed
             const parts = cleanedDateString.split(/[-/T\s:]/); // split by common delimiters
             if (parts.length >=3) {
                 const year = parseInt(parts[0]);
                 const month = parseInt(parts[1]) -1; // JS months are 0-indexed
                 const day = parseInt(parts[2]);
                 const composedDate = new Date(year, month, day);
                 if (!isNaN(composedDate.getTime())) {
                     return `${composedDate.getDate()} ${composedDate.toLocaleString('default', { month: 'short' })}, ${composedDate.getFullYear()}`;
                 }
             }
            console.warn("Could not format date (attempt 1):", dateString);
            return dateString.split(" ")[0] || "N/A"; // Return original date part or N/A
        }
        const day = date.getDate();
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear();
        return `${day} ${month}, ${year}`;
    } catch (e) {
        console.warn("Could not format date (attempt 2):", dateString, e);
        return dateString.split(" ")[0] || "N/A"; // Return original date part or N/A
    }
}


document.addEventListener('DOMContentLoaded', function () {
    // --- Placeholder for student login ---
    // In a real app, you'd get this after login.
    // For testing, you can manually set it here or use a prompt.
    let loggedInStudentGmailID = localStorage.getItem('loggedInStudentGmailID');
    if (!loggedInStudentGmailID) {
        loggedInStudentGmailID = prompt("Enter your Student Gmail ID for testing (e.g., student1@example.pk):");
        if (loggedInStudentGmailID) {
            localStorage.setItem('loggedInStudentGmailID', loggedInStudentGmailID);
        } else {
            document.body.innerHTML = "<p>Student Gmail ID is required to view the dashboard. Please refresh and enter an ID.</p>";
            return;
        }
    }
    // --- End Placeholder ---

    loadAndProcessData(loggedInStudentGmailID);
    setupEventListeners(); // Keep this for tab/modal interactivity
});

function setupEventListeners() {
    const mainTabs = document.querySelectorAll('.main-tab-button');
    const mainTabContents = document.querySelectorAll('.main-tab-content');
    const hamburgerButton = document.getElementById('hamburgerButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    document.getElementById('currentYear').textContent = new Date().getFullYear();

    if (hamburgerButton && mobileMenu) {
        hamburgerButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    function switchTab(tabElement) {
        const targetTabName = tabElement.getAttribute('data-main-tab');
        mainTabs.forEach(t => t.classList.remove('active'));
        mainTabContents.forEach(content => content.classList.add('hidden'));
        mobileNavLinks.forEach(link => link.classList.remove('active'));

        const desktopTabToActivate = document.querySelector(`.main-tab-button[data-main-tab="${targetTabName}"]`);
        if (desktopTabToActivate) desktopTabToActivate.classList.add('active');
        
        const mobileLinkToActivate = document.querySelector(`.mobile-nav-link[data-main-tab="${targetTabName}"]`);
        if (mobileLinkToActivate) mobileLinkToActivate.classList.add('active');

        const targetContentId = targetTabName + '-content';
        const targetElement = document.getElementById(targetContentId);
        if (targetElement) {
            targetElement.classList.remove('hidden');
        }
        if (targetContentId === 'overview-content' && currentStudentData.name) { // Ensure data is loaded
            initializeOverviewCharts(currentStudentData); 
        }
        const firstSubTab = document.querySelector(`#${targetContentId} .sub-tab-button`);
        if (firstSubTab) {
            firstSubTab.click(); 
        }
        if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
            mobileMenu.classList.add('hidden');
        }
    }

    mainTabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab));
    });

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            switchTab(link);
        });
    });

    document.querySelectorAll('.sub-tab-button').forEach(subTab => {
        subTab.addEventListener('click', () => {
            const parentMainTabContent = subTab.closest('.main-tab-content');
            parentMainTabContent.querySelectorAll('.sub-tab-button').forEach(st => st.classList.remove('active'));
            parentMainTabContent.querySelectorAll('.sub-tab-content-panel').forEach(panel => panel.classList.add('hidden'));
            subTab.classList.add('active');
            const targetSubContentId = subTab.getAttribute('data-sub-tab') + '-content';
            document.getElementById(targetSubContentId)?.classList.remove('hidden');
        });
    });
    
    // Activate overview tab by default after data is processed and displayed
    // This is now called from displayData after currentStudentData is ready
}

async function loadAndProcessData(loggedInStudentGmailID) {
    if (!loggedInStudentGmailID) {
        console.error("No logged-in student Gmail ID provided.");
        document.getElementById('studentNameDisplay').textContent = `Welcome! Please log in.`;
        return;
    }
    console.log("Fetching data for student:", loggedInStudentGmailID);

    try {
        const [aggregatedResponse, questionsResponse] = await Promise.all([
            fetch(AGGREGATED_SCORES_CSV_URL),
            fetch(QUESTION_DETAILS_CSV_URL)
        ]);

        if (!aggregatedResponse.ok || !questionsResponse.ok) {
            console.error("Failed to fetch one or both CSV files.");
            let errorMsg = "Error loading data: ";
            if (!aggregatedResponse.ok) errorMsg += `Aggregated Scores CSV (${aggregatedResponse.statusText}). `;
            if (!questionsResponse.ok) errorMsg += `Question Details CSV (${questionsResponse.statusText}).`;
            alert(errorMsg + " Please check the console and ensure the CSV URLs are correct and publicly accessible.");
            return;
        }
        
        const aggregatedCsvText = await aggregatedResponse.text();
        const questionsCsvText = await questionsResponse.text();

        const aggregatedResult = Papa.parse(aggregatedCsvText, { header: true, skipEmptyLines: true });
        const questionsResult = Papa.parse(questionsCsvText, { header: true, skipEmptyLines: true });
        
        allAggregatedData = aggregatedResult.data;
        allQuestionDetailsData = questionsResult.data;

        console.log("Aggregated Data Raw:", allAggregatedData.slice(0,5));
        console.log("Question Details Raw:", allQuestionDetailsData.slice(0,5));

        currentStudentData = transformDataForDashboard(allAggregatedData, allQuestionDetailsData, loggedInStudentGmailID);
        
        if (currentStudentData && currentStudentData.name) {
            displayData(currentStudentData);
            // Activate overview tab by default
            const overviewTabButton = document.querySelector('.main-tab-button[data-main-tab="overview"]');
            if (overviewTabButton) {
                overviewTabButton.click();
            }
        } else {
            console.error("No data found or processed for student:", loggedInStudentGmailID);
            alert(`No data found for student Gmail ID: ${loggedInStudentGmailID}. Please check the ID or the data source.`);
            document.getElementById('studentNameDisplay').textContent = `Data not found for ${loggedInStudentGmailID}`;
        }

    } catch (error) {
        console.error("Error loading or parsing CSV data:", error);
        alert("A critical error occurred while loading dashboard data. Please check the console for details.");
    }
}

function transformDataForDashboard(aggregatedDataArray, questionDetailsArray, loggedInStudentGmailID) {
    const studentAggregated = aggregatedDataArray.filter(row => row.StudentGmailID === loggedInStudentGmailID);
    const studentQuestions = questionDetailsArray.filter(row => row.StudentGmailID === loggedInStudentGmailID);

    if (studentAggregated.length === 0) {
        console.warn("No aggregated data found for student:", loggedInStudentGmailID);
        // Try to get name from mapping if student is in mapping but has no scores
        const studentMappingEntry = allAggregatedData.find(row => row.StudentGmailID === loggedInStudentGmailID); // Check full data for a name
        return { 
            name: studentMappingEntry ? (studentMappingEntry.StudentName_Canvas || loggedInStudentGmailID) : loggedInStudentGmailID, // Placeholder name
            isDataAvailable: false 
        }; 
    }

    let transformed = {
        name: loggedInStudentGmailID, // Placeholder, will try to update from studentMap if available in studentAggregated
        targetScore: "N/A", // Placeholder
        latestScores: { total: "N/A", rw: "N/A", math: "N/A", avgEocPractice: "N/A" },
        classAveragesGlobal: { total: "N/A", rw: "N/A", math: "N/A", avgEocPractice: "N/A" },
        scoreTrend: { labels: [], studentScores: [], classAvgScores: [] },
        overallSkillPerformance: { labels: ['Reading', 'Writing & Language', 'Math'], studentAccuracy: [0, 0, 0], classAvgAccuracy: [0, 0, 0] },
        strengths: [],
        improvements: [],
        timeSpent: { studentAvg: "N/A", studentUnit: "", classAvg: "N/A", classUnit: ""}, // This part is hard to derive from current feeds
        cbPracticeTests: [],
        eocQuizzes: { reading: [], writing: [], math: [] },
        khanAcademy: { reading: [], writing: [], math: [] },
        cbSkills: { reading: [], writing: [], math: [] },
        questionDetails: studentQuestions, // Store all question details for the student for modal
        isDataAvailable: true
    };

    // Try to find student name and target score from studentMap (which is part of studentDetailsByGmail in Apps Script)
    // This assumes studentMap might be implicitly part of the aggregated feed or needs separate fetch.
    // For now, we'll try to get it from the first row of student's aggregated data if such columns were added.
    // The Apps Script currently doesn't add StudentName or TargetScore directly to feed rows.
    // This part needs Student_Mapping data to be available client-side or these details added to feed by Apps Script.
    // For now, we'll just use the Gmail ID as name, or if studentAggregated has a name field.
    if(studentAggregated[0] && studentAggregated[0].StudentName_Canvas) { // Assuming StudentName_Canvas might be in feed
         transformed.name = studentAggregated[0].StudentName_Canvas;
    } else if (studentAggregated[0] && studentAggregated[0].StudentName_Full) {
         transformed.name = studentAggregated[0].StudentName_Full;
    }
    // Target score is harder, needs to come from Student_Mapping, not directly in aggregated feed typically
    // If 'StudentTargetScore' was added to the aggregated feed by Apps Script (it wasn't in the last version):
    if (studentAggregated[0] && studentAggregated[0].StudentTargetScore) {
        transformed.targetScore = studentAggregated[0].StudentTargetScore;
    }


    // --- Populate Latest Scores & Class Averages (Overview) ---
    const cbTests = studentAggregated.filter(r => r.AssessmentSource === 'Canvas CB Test').sort((a,b) => new Date(b.AttemptDate) - new Date(a.AttemptDate));
    if (cbTests.length > 0) {
        const latestTest = cbTests[0];
        transformed.latestScores.total = latestTest.ScaledScore_Total || "N/A";
        transformed.latestScores.rw = latestTest.ScaledScore_RW || "N/A";
        transformed.latestScores.math = latestTest.ScaledScore_Math || "N/A";
        
        transformed.classAveragesGlobal.total = latestTest.ClassAverageScore_Normalized || "N/A"; // This is normalized, not scaled total
        // Note: Feed doesn't have specific class avg scaled RW/Math, so using overall normalized for now.
        // This would ideally be ClassAverage_RW_Scaled, ClassAverage_Math_Scaled from feed.
        transformed.classAveragesGlobal.rw = "N/A"; // Placeholder as feed doesn't provide class avg SCALED RW
        transformed.classAveragesGlobal.math = "N/A"; // Placeholder
    }

    const eocPracticeScores = studentAggregated
        .filter(r => r.AssessmentSource === 'Canvas EOC Practice' && r.Score_Percentage)
        .map(r => parseFloat(String(r.Score_Percentage).replace('%', '')));
    if (eocPracticeScores.length > 0) {
        transformed.latestScores.avgEocPractice = (eocPracticeScores.reduce((a,b) => a + b, 0) / eocPracticeScores.length).toFixed(0) + '%';
    }
    // Class Average EOC Practice Score
    const classEocEntries = allAggregatedData.filter(r => r.AssessmentSource === 'Canvas EOC Practice' && r.CanvasQuizID && r.ClassAverageScore_Normalized);
    const uniqueClassEocAvgs = {};
    classEocEntries.forEach(r => {
        if (r.ClassAverageScore_Normalized && String(r.ClassAverageScore_Normalized).includes('%')) {
            uniqueClassEocAvgs[r.AssessmentName] = parseFloat(String(r.ClassAverageScore_Normalized).replace('%',''));
        }
    });
    const classEocAvgValues = Object.values(uniqueClassEocAvgs);
    if (classEocAvgValues.length > 0) {
        transformed.classAveragesGlobal.avgEocPractice = (classEocAvgValues.reduce((a,b) => a+b, 0) / classEocAvgValues.length).toFixed(0) + '%';
    }


    // --- Populate Score Trend ---
    cbTests.slice().reverse().forEach(test => { // .slice() to avoid mutating original, .reverse() for chronological
        transformed.scoreTrend.labels.push(test.AssessmentName);
        transformed.scoreTrend.studentScores.push(parseFloat(test.ScaledScore_Total) || 0);
        // Assuming ClassAverageScore_Normalized on CB Test rows is the class avg total for that test
        transformed.scoreTrend.classAvgScores.push(parseFloat(String(test.ClassAverageScore_Normalized).replace('%','')) * 16 || 0); // Scale % to /1600 roughly
    });


    // --- Populate Overall Skill Performance & Strengths/Improvements (Basic Implementation) ---
    // This needs robust SAT_Skill_Tag data. For now, it will be very basic.
    // Mapping from granular skills to broad categories (Reading, Writing, Math)
    // This mapping is highly dependent on your actual skill tags. This is a placeholder.
    const skillToCategory = (skillTag) => {
        if (!skillTag || typeof skillTag !== 'string') return 'Unknown';
        const tag = skillTag.toLowerCase();
        if (tag.includes('read') || tag.includes('vocab') || tag.includes('evidence') || tag.includes('info') || tag.includes('ideas')) return 'Reading';
        if (tag.includes('writ') || tag.includes('lang') || tag.includes('gramm') || tag.includes('expression') || tag.includes('conventions')) return 'Writing & Language';
        if (tag.includes('math') || tag.includes('alg') || tag.includes('geom') || tag.includes('data') || tag.includes('adv') || tag.includes('problem solv')) return 'Math';
        return 'Unknown';
    };

    const studentSkillPerformance = { Reading: { correct: 0, total: 0 }, 'Writing & Language': { correct: 0, total: 0 }, Math: { correct: 0, total: 0 } };
    const classSkillPerformance = { Reading: { correct: 0, total: 0 }, 'Writing & Language': { correct: 0, total: 0 }, Math: { correct: 0, total: 0 } };
    const granularSkills = {}; // { skillName: { studentCorrect: N, studentTotal: N, classAvgPoints: [], questions: N } }

    studentQuestions.forEach(q => {
        const category = skillToCategory(q.SAT_Skill_Tag);
        const pointsPossible = parseFloat(q.PointsPossible_Question) || 1;
        const pointsEarned = parseFloat(q.PointsEarned) || 0;
        const classAvgPoints = parseFloat(q.ClassAveragePoints_Question);

        if (category !== 'Unknown') {
            studentSkillPerformance[category].correct += pointsEarned;
            studentSkillPerformance[category].total += pointsPossible;
        }
        // For class skill perf - this is tricky. ClassAveragePoints_Question is already an average.
        // Let's use it directly if available.
        if (category !== 'Unknown' && !isNaN(classAvgPoints)) {
            classSkillPerformance[category].correct += classAvgPoints; // Summing averages for now, then will average them.
            classSkillPerformance[category].total += pointsPossible; // A bit of a mix, this part needs refinement based on how ClassAveragePoints_Question is defined.
                                                                   // A better approach for class skill is if Apps Script pre-calculates it.
        }

        // For granular skills (strengths/weaknesses)
        if (q.SAT_Skill_Tag && q.SAT_Skill_Tag !== 'TBD' && q.SAT_Skill_Tag.trim() !== '') {
            if (!granularSkills[q.SAT_Skill_Tag]) {
                granularSkills[q.SAT_Skill_Tag] = { studentCorrect: 0, studentTotal: 0, classCorrectPercentageSum: 0, questions: 0 };
            }
            granularSkills[q.SAT_Skill_Tag].studentCorrect += pointsEarned;
            granularSkills[q.SAT_Skill_Tag].studentTotal += pointsPossible;
            if (!isNaN(classAvgPoints) && pointsPossible > 0) {
                 granularSkills[q.SAT_Skill_Tag].classCorrectPercentageSum += (classAvgPoints / pointsPossible * 100);
                 granularSkills[q.SAT_Skill_Tag].questions++;
            }
        }
    });

    transformed.overallSkillPerformance.studentAccuracy = [
        studentSkillPerformance.Reading.total > 0 ? (studentSkillPerformance.Reading.correct / studentSkillPerformance.Reading.total * 100) : 0,
        studentSkillPerformance['Writing & Language'].total > 0 ? (studentSkillPerformance['Writing & Language'].correct / studentSkillPerformance['Writing & Language'].total * 100) : 0,
        studentSkillPerformance.Math.total > 0 ? (studentSkillPerformance.Math.correct / studentSkillPerformance.Math.total * 100) : 0
    ].map(s => parseFloat(s.toFixed(0)));
    
    // Placeholder for class skill accuracy as simple average of question averages per category (needs more robust data)
     transformed.overallSkillPerformance.classAvgAccuracy = [
        classSkillPerformance.Reading.total > 0 ? (classSkillPerformance.Reading.correct / classSkillPerformance.Reading.total * 100) : 0, // This is a rough proxy
        classSkillPerformance['Writing & Language'].total > 0 ? (classSkillPerformance['Writing & Language'].correct / classSkillPerformance['Writing & Language'].total * 100) : 0,
        classSkillPerformance.Math.total > 0 ? (classSkillPerformance.Math.correct / classSkillPerformance.Math.total * 100) : 0
    ].map(s => parseFloat(s.toFixed(0)));


    const skillDetails = [];
    for (const skillName in granularSkills) {
        const data = granularSkills[skillName];
        const studentAccuracy = data.studentTotal > 0 ? (data.studentCorrect / data.studentTotal * 100) : 0;
        const classAccuracy = data.questions > 0 ? (data.classCorrectPercentageSum / data.questions) : 0;
        skillDetails.push({ name: skillName, studentAccuracy, classAccuracy, diff: studentAccuracy - classAccuracy });
    }
    skillDetails.sort((a,b) => b.diff - a.diff); // Sort by biggest positive difference from class
    transformed.strengths = skillDetails.filter(s => s.diff > 10 && s.studentAccuracy > 75).slice(0, 3).map(s => `${s.name} (${s.studentAccuracy.toFixed(0)}%)`);
    skillDetails.sort((a,b) => a.diff - b.diff); // Sort by biggest negative difference from class
    transformed.improvements = skillDetails.filter(s => s.diff < -10 && s.studentAccuracy < 60).slice(0, 3).map(s => `${s.name} (${s.studentAccuracy.toFixed(0)}%)`);


    // --- Populate CB Practice Tests Table ---
    studentAggregated.forEach(row => {
        if (row.AssessmentSource === 'Canvas CB Test' || row.AssessmentSource === 'Canvas CB Module') {
            transformed.cbPracticeTests.push({
                name: row.AssessmentName,
                date: formatDate(row.AttemptDate),
                rw: row.ScaledScore_RW || '-',
                math: row.ScaledScore_Math || '-',
                total: row.ScaledScore_Total || '-',
                classAvgRW: row.ClassAverageScore_RW_Scaled || '-', // These specific class scaled scores are not in current feed
                classAvgMath: row.ClassAverageScore_Math_Scaled || '-', // These specific class scaled scores are not in current feed
                classAvgTotal: row.ClassAverageScore_Normalized || '-' // Using overall normalized as proxy
            });
        }
    });
    // Sort by date descending if dates are valid, otherwise by name
    transformed.cbPracticeTests.sort((a,b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (!isNaN(dateA) && !isNaN(dateB)) return dateB - dateA;
        return a.name.localeCompare(b.name);
    });


    // --- Populate EOC Quizzes, Khan Academy, CB Skills by Subject ---
    const eocChapters = { /* from dummy data, or should be dynamically built if possible */ }; // Using current structure
    studentAggregated.forEach(row => {
        const assessmentName = row.AssessmentName;
        let subject = 'unknown';
        // Basic subject inference (can be improved with better metadata)
        if (assessmentName.toLowerCase().includes('-r-') || assessmentName.toLowerCase().startsWith('r-')) subject = 'reading';
        else if (assessmentName.toLowerCase().includes('-w-') || assessmentName.toLowerCase().startsWith('w-')) subject = 'writing';
        else if (assessmentName.toLowerCase().includes('-m-') || assessmentName.toLowerCase().startsWith('m-')) subject = 'math';
        else if (assessmentName.toLowerCase().includes('reading')) subject = 'reading';
        else if (assessmentName.toLowerCase().includes('writing')) subject = 'writing';
        else if (assessmentName.toLowerCase().includes('math')) subject = 'math';


        if (row.AssessmentSource === 'Canvas EOC Practice') {
            if (transformed.eocQuizzes[subject]) {
                 transformed.eocQuizzes[subject].push({
                    name: assessmentName,
                    latestScore: `${row.Score_Percentage || 'N/A'} (${row.Score_Raw_Combined || 'N/A'}/${row.PointsPossible_Combined || 'N/A'})`,
                    classAvg: row.ClassAverageScore_Normalized || "N/A",
                    date: formatDate(row.AttemptDate)
                });
            }
        } else if (row.AssessmentSource === 'Khan Academy Practice') {
             if (transformed.khanAcademy[subject]) {
                transformed.khanAcademy[subject].push({
                    name: assessmentName,
                    date: formatDate(row.AttemptDate),
                    score: `${row.Score_Raw_Combined || 'N/A'}/${row.PointsPossible_Combined || 'N/A'} (${row.Score_Percentage || 'N/A'})`,
                    pointsPossible: row.PointsPossible_Combined || "N/A",
                    classAvg: row.ClassAverageScore_Normalized || "N/A" // No specific class avg for Khan in feed
                });
            }
        }
    });
    
    // Populate CB Skills (from granularSkills derived from questionDetails)
    for (const skillName in granularSkills) {
        const data = granularSkills[skillName];
        const category = skillToCategory(skillName);
        if (transformed.cbSkills[category]) {
             transformed.cbSkills[category].push({
                name: skillName,
                score: parseFloat(data.studentTotal > 0 ? (data.studentCorrect / data.studentTotal * 100).toFixed(0) : 0),
                classAvg: parseFloat(data.questions > 0 ? (data.classCorrectPercentageSum / data.questions).toFixed(0) : 0)
            });
        }
    }


    console.log("Transformed currentStudentData:", transformed);
    return transformed;
}


function displayData(studentData) {
    if (!studentData || !studentData.isDataAvailable) {
        // Display a message if no data for student, or handle as needed
        console.warn("No data available to display for student or student data incomplete.");
        if (studentData && studentData.name) { // Name might still be set to GmailID
            document.getElementById('studentNameDisplay').textContent = `Welcome, ${studentData.name} (No performance data found)`;
        }
        // Optionally clear or hide sections
        document.getElementById('overview-content').innerHTML = "<p class='text-center p-4'>No performance data available for this student.</p>";
        document.getElementById('cb-practice-tests-content').innerHTML = "";
        document.getElementById('reading-content').innerHTML = "";
        // etc. for other tabs
        return;
    }

    document.getElementById('studentNameDisplay').textContent = `Welcome, ${studentData.name}!`;
    
    // Overview Snapshot
    const snapshotDiv = document.querySelector('#overview-content .grid-cols-1'); // More specific selector
    if (snapshotDiv && snapshotDiv.children.length >= 5) { // Assuming 5 score cards
        snapshotDiv.children[0].querySelector('.score-value').innerHTML = `${studentData.latestScores.total} <span class="text-lg text-gray-500">/ 1600</span>`;
        snapshotDiv.children[0].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.total || 'N/A'}`;
        
        snapshotDiv.children[1].querySelector('.score-value').innerHTML = `${studentData.latestScores.rw} <span class="text-lg text-gray-500">/ 800</span>`;
        snapshotDiv.children[1].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.rw || 'N/A'}`;
        
        snapshotDiv.children[2].querySelector('.score-value').innerHTML = `${studentData.latestScores.math} <span class="text-lg text-gray-500">/ 800</span>`;
        snapshotDiv.children[2].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.math || 'N/A'}`;
        
        snapshotDiv.children[3].querySelector('.score-value').textContent = studentData.latestScores.avgEocPractice || 'N/A';
        snapshotDiv.children[3].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.avgEocPractice || 'N/A'}`;

        snapshotDiv.children[4].querySelector('.text-3xl').textContent = studentData.targetScore || 'N/A';
        // Update goal text if target score and latest total score are available
        const latestTotal = parseFloat(studentData.latestScores.total);
        const target = parseFloat(studentData.targetScore);
        if (!isNaN(latestTotal) && !isNaN(target) && target > latestTotal) {
            snapshotDiv.children[4].querySelector('.text-sm').textContent = `Goal: +${target - latestTotal} points`;
        } else if (!isNaN(target)) {
             snapshotDiv.children[4].querySelector('.text-sm').textContent = `Target set.`;
        } else {
             snapshotDiv.children[4].querySelector('.text-sm').textContent = `Set a target!`;
        }
    }

    populateOverviewSnapshot(studentData); // For strengths, weaknesses, time (time part may need update)
    populatePracticeTestsTable(studentData.cbPracticeTests);
    
    ['reading', 'writing', 'math'].forEach(subject => {
        const studentEOCs = studentData.eocQuizzes[subject] || [];
        populateEOCTable(subject, studentEOCs);
        
        const studentKhan = studentData.khanAcademy[subject] || [];
        populateKhanSection(subject, studentKhan);
        
        const studentCBSkills = studentData.cbSkills[subject] || [];
        populateCBSkills(subject, studentCBSkills);
    });
}


// Existing chart instances - keep these global
let scoreTrendChartInstance = null; 
let overallSkillChartInstance = null;
let modalDonutChartInstance = null; 
let modalLineChartInstance = null; 

function populateOverviewSnapshot(studentData) { // Modified to use transformed data
    const overviewStrengthsList = document.getElementById('overviewStrengthsList'); 
    const overviewImprovementsList = document.getElementById('overviewImprovementsList');
    // const timeSpentOverviewDiv = document.getElementById('timeSpentOverview'); // Time spent is more complex
    
    if(overviewStrengthsList) {
        overviewStrengthsList.innerHTML = ''; 
        (studentData.strengths || []).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            overviewStrengthsList.appendChild(li);
        });
        if ((studentData.strengths || []).length === 0) overviewStrengthsList.innerHTML = '<li>Keep practicing to identify strengths!</li>';

    }
    if(overviewImprovementsList) {
        overviewImprovementsList.innerHTML = ''; 
        (studentData.improvements || []).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            overviewImprovementsList.appendChild(li);
        });
         if ((studentData.improvements || []).length === 0) overviewImprovementsList.innerHTML = '<li>Doing great! Review detailed reports for focus areas.</li>';
    }
    // Time spent needs a different data source or interpretation.
    // if(timeSpentOverviewDiv && studentData.timeSpent) { ... } 
}

function initializeOverviewCharts(studentData) {
    const primaryChartColor = '#2a5266'; 
    const secondaryChartColor = '#757575'; 
    const barChartPrimaryBg = 'rgba(42, 82, 102, 0.8)'; 
    const barChartSecondaryBg = 'rgba(117, 117, 117, 0.7)';

    const chartOptions = { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: true, position: 'bottom' }}};
    
    const scoreTrendCtx = document.getElementById('scoreTrendChart')?.getContext('2d');
    if (scoreTrendCtx) {
        if (scoreTrendChartInstance) scoreTrendChartInstance.destroy();
        scoreTrendChartInstance = new Chart(scoreTrendCtx, { 
            type: 'line', 
            data: { 
                labels: studentData.scoreTrend.labels, 
                datasets: [
                    { label: 'Your Total Score', data: studentData.scoreTrend.studentScores, borderColor: primaryChartColor, tension: 0.1, fill: false },
                    { label: 'Class Average Total Score', data: studentData.scoreTrend.classAvgScores, borderColor: secondaryChartColor, tension: 0.1, borderDash: [5, 5], fill: false }
                ] 
            }, 
            options: chartOptions 
        });
    }
    
    const overallSkillCtx = document.getElementById('overallSkillChart')?.getContext('2d');
    if (overallSkillCtx) {
        if (overallSkillChartInstance) overallSkillChartInstance.destroy();
        overallSkillChartInstance = new Chart(overallSkillCtx, { 
            type: 'bar', 
            data: { 
                labels: studentData.overallSkillPerformance.labels, 
                datasets: [
                    { label: 'Your Accuracy', data: studentData.overallSkillPerformance.studentAccuracy, backgroundColor: barChartPrimaryBg },
                    { label: 'Class Average Accuracy', data: studentData.overallSkillPerformance.classAvgAccuracy, backgroundColor: barChartSecondaryBg }
                ] 
            }, 
            options: { ...chartOptions, scales: { y: { beginAtZero: true, max: 100 } } } 
        });
    }
}

function populatePracticeTestsTable(testsData) {
    const cbTableBody = document.getElementById('cb-practice-tests-table-body');
    if (!cbTableBody) return;
    cbTableBody.innerHTML = ''; 
    if (!testsData || testsData.length === 0) {
        cbTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-3">No CB Practice Test data available.</td></tr>`;
        return;
    }
    testsData.forEach(test => {
        const row = cbTableBody.insertRow();
        row.className = 'clickable-row';
        row.innerHTML = `<td>${test.name}</td><td>${test.date}</td><td>${test.rw}</td><td>${test.math}</td><td>${test.total}</td><td>${test.classAvgRW}</td><td>${test.classAvgMath}</td><td>${test.classAvgTotal}</td>`;
        row.onclick = () => openModal(`${test.name} Details`, { type: 'cb_test', assessmentName: test.name, studentData: currentStudentData });
    });
}

function populateEOCTable(sectionKey, eocQuizData) {
    const tbody = document.getElementById(`${sectionKey}-eoc-tbody`);
    const thead = document.getElementById(`${sectionKey}-eoc-thead`);
    if (!tbody || !thead) return;
    
    thead.innerHTML = `<tr><th>Chapter/Practice Name</th><th>Latest Score</th><th>Date Attempted</th><th>Class Avg Score</th></tr>`;
    tbody.innerHTML = ''; 

    if (!eocQuizData || eocQuizData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-3">No EOC Practice data available for ${sectionKey}.</td></tr>`;
        return;
    }
    eocQuizData.forEach(item => {
        const row = tbody.insertRow();
        row.className = 'clickable-row';
        row.innerHTML = `<td>${item.name}</td><td>${item.latestScore}</td><td>${item.date}</td><td>${item.classAvg}</td>`;
        row.onclick = () => openModal(`EOC Practice: ${item.name}`, { type: 'eoc_quiz', assessmentName: item.name, studentData: currentStudentData });
    });
}

function populateKhanSection(sectionKey, khanItems) {
    const container = document.getElementById(`${sectionKey}-khan-data`);
    if (!container) return;
    container.innerHTML = ''; 

    if (khanItems && khanItems.length > 0) {
        const table = document.createElement('table');
        table.className = 'min-w-full table';
        table.innerHTML = `<thead><tr><th>Assignment Name</th><th>Date</th><th>Your Score</th><th>Points Possible</th><th>Class Avg</th></tr></thead><tbody></tbody>`;
        const tbody = table.querySelector('tbody');
        khanItems.forEach(item => {
            const row = tbody.insertRow();
            row.className = 'clickable-row';
            row.innerHTML = `<td>${item.name}</td><td>${item.date}</td><td>${item.score}</td><td>${item.pointsPossible}</td><td>${item.classAvg}</td>`;
            row.onclick = () => openModal(`Khan Academy Practice: ${item.name}`, { type: 'khan', assessmentName: item.name, studentData: currentStudentData });
        });
        container.appendChild(table);
    } else {
        container.innerHTML = `<p class="text-gray-600 p-3">No Khan Academy Practice data available for ${sectionKey}.</p>`;
    }
}

function getPerformanceClass(score) {
    if (score >= 85) return 'performance-good';
    if (score >= 70) return 'performance-average';
    return 'performance-poor';
}

function populateCBSkills(sectionKey, skillsData) {
    const container = document.getElementById(`${sectionKey}-cb-skills-data`);
    if (!container) return;
    container.innerHTML = ''; 

    if (skillsData && skillsData.length > 0) {
        skillsData.forEach(skill => {
            const skillDiv = document.createElement('div');
            skillDiv.className = 'p-3 bg-gray-50 rounded-md border border-gray-200';
            const studentScore = typeof skill.score === 'number' ? skill.score : 0;
            const classAverage = typeof skill.classAvg === 'number' ? skill.classAvg : 0;
            const performanceClass = getPerformanceClass(studentScore);
            skillDiv.innerHTML = `
                <div class="flex justify-between items-center mb-1"><span class="text-sm font-medium text-gray-800">${skill.name}</span><span class="text-xs ${performanceClass.replace('performance-', 'text-')} font-semibold">${studentScore}%</span></div>
                <div class="progress-bar-container"><div class="progress-bar ${performanceClass}" style="width: ${studentScore}%"></div></div>
                <p class="text-xs text-gray-500 mt-1">Class Avg: ${classAverage}%</p>`;
            container.appendChild(skillDiv);
        });
    } else {
         container.innerHTML = `<p class="text-gray-500 p-3">No Skill data available for ${sectionKey}. Ensure skill tags are well-populated in the data source.</p>`;
    }
}

const modal = document.getElementById('detailModal');
const modalQuestionDetailsContainer = document.getElementById('modalQuestionDetails');

function openModal(title, contentDetails) { 
    if (!modal || !modalQuestionDetailsContainer) return;
    
    const modalHeaderH2 = modal.querySelector('.modal-header h2'); 
    if(modalHeaderH2) modalHeaderH2.textContent = title;
    
    modalQuestionDetailsContainer.innerHTML = ''; 
    
    const assessmentName = contentDetails.assessmentName;
    const studentQuestionDataForAssessment = currentStudentData.questionDetails
        ? currentStudentData.questionDetails.filter(q => q.AssessmentName === assessmentName)
        : [];

    if (studentQuestionDataForAssessment.length === 0) {
        modalQuestionDetailsContainer.innerHTML = '<p>No detailed question data available for this assessment.</p>';
    } else {
        studentQuestionDataForAssessment.forEach((q, i) => {
            const d = document.createElement('div');
            let statusText, statusClass;
            const isCorrect = String(q.IsCorrect).toLowerCase() === 'true';
            const studentAnswer = q.StudentAnswer || "N/A";

            if (studentAnswer === "N/A") { // Assuming N/A means unanswered
                statusText = 'Unanswered';
                statusClass = 'bg-yellow-50 border-yellow-200 text-yellow-700';
            } else if (isCorrect) {
                statusText = 'Correct';
                statusClass = 'bg-green-50 border-green-200 text-green-700';
            } else {
                statusText = 'Incorrect';
                statusClass = 'bg-red-50 border-red-200 text-red-700';
            }
            
            const classAvgPoints = parseFloat(q.ClassAveragePoints_Question);
            const pointsPossible = parseFloat(q.PointsPossible_Question) || 1;
            let classCorrectPercentText = "N/A";
            if (!isNaN(classAvgPoints) && pointsPossible > 0) {
                const classCorrectPercent = (classAvgPoints / pointsPossible * 100).toFixed(0);
                classCorrectPercentText = `${classCorrectPercent}% ${classCorrectPercent > 75 ? '<span class="arrow-up">↑</span>' : (classCorrectPercent < 50 ? '<span class="arrow-down">↓</span>' : '')}`;
            }


            d.className = `p-2 border rounded-md ${statusClass}`;
            d.innerHTML = `
                <p class="font-medium text-gray-700">Q${q.QuestionSequenceInQuiz || (i+1)}: ${q.QuestionText_fromMetadata || 'N/A'}</p>
                <p>Your Answer: <span class="font-semibold">${studentAnswer}</span> (${statusText})</p>
                <p>Points: ${q.PointsEarned || 0} / ${pointsPossible}</p>
                <p>Skill: ${q.SAT_Skill_Tag || 'N/A'}</p>
                <p class="text-xs text-gray-500">Class Avg Correctness: ${classCorrectPercentText}</p>`;
            modalQuestionDetailsContainer.appendChild(d);
        });
    }
    
    if(modalDonutChartInstance) modalDonutChartInstance.destroy();
    if(modalLineChartInstance) modalLineChartInstance.destroy();
    
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    studentQuestionDataForAssessment.forEach(q => {
        const isCorrect = String(q.IsCorrect).toLowerCase() === 'true';
        const studentAnswer = q.StudentAnswer || "N/A";
        if (studentAnswer === "N/A") unansweredCount++;
        else if (isCorrect) correctCount++;
        else incorrectCount++;
    });
    
    const donutCtx = document.getElementById('modalDonutChart')?.getContext('2d');
    if (donutCtx) { 
        modalDonutChartInstance = new Chart(donutCtx,{type:'doughnut',data:{labels:['Correct','Incorrect','Unanswered'],datasets:[{data:[correctCount, incorrectCount, unansweredCount],backgroundColor:['#4caf50','#f44336','#9e9e9e'], hoverOffset: 4}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{position:'bottom'}},cutout:'50%'}});
    }

    // Dummy Line chart in modal - replace with actual relevant data if needed
    const lineCtx = document.getElementById('modalLineChart')?.getContext('2d');
    if (lineCtx) { 
        modalLineChartInstance=new Chart(lineCtx,{type:'line',data:{labels:['A1','A2','A3','A4','A5'],datasets:[{label:'Your Score Trend (Sample)',data:Array.from({length:5},()=>50+Math.random()*40),borderColor:'#2a5266',tension:0.1,fill:false}]},options:{responsive:true,maintainAspectRatio:true,scales:{y:{beginAtZero:true,max:100}}}});
    }
    if(modal) modal.style.display="block";
}

function closeModal() { 
    if(modal) modal.style.display = "none"; 
    if (modalDonutChartInstance) modalDonutChartInstance.destroy(); 
    if (modalLineChartInstance) modalLineChartInstance.destroy(); 
}

window.onclick = function(event) { 
    if (event.target == modal) closeModal(); 
}
