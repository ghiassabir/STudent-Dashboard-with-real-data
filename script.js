// --- Constants for Data Files ---
const AGGREGATED_SCORES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSySYBO9YL3N4aUG3JEYZMQQIv9d1oSm3ba4Ty9Gt4SsGs2zmTS_k81rH3Qv41mZvClnayNcDpl_QbI/pub?gid=1890969747&single=true&output=csv';
const QUESTION_DETAILS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSySYBO9YL3N4aUG3JEYZMQQIv9d1oSm3ba4Ty9Gt4SsGs2zmTS_k81rH3Qv41mZvClnayNcDpl_QbI/pub?gid=822014112&single=true&output=csv';

let currentStudentData = {};
let allAggregatedData = []; // Holds all students' aggregated data from the feed
let allQuestionDetailsData = []; // Holds all students' question details from the feed

// Predefined EOC Chapters - !!! USER MUST UPDATE THESE TO MATCH THEIR CURRICULUM !!!
const eocChapters = {
    reading: ["Vocabulary in Context", "Making the Leap", "The Big Picture", "Literal Comprehension", "Reading for Function", "Supporting & Undermining", "Graphs & Charts", "Paired Passages"],
    writing: ["Transitions", "Specific Focus", "Sentences & Fragments", "Joining & Separating Sentences", "Non-Essential & Essential Clauses", "Verbs Agreements and Tense", "Pronouns", "Modification", "Parallel Structure"],
    math: ["Exponents & Radicals", "Percent", "Rates", "Ratio & Proportion", "Expressions", "Constructing Models", "Manipulating & Solving Equations", "Systems of Equations", "Inequalities", "Lines", "Functions", "Quadratics", "Angles", "Triangles", "Circles", "Trigonometry", "Probability", "Statistics 1"]
};

// --- Date Formatting Helper ---
function formatDate(dateString) {
    if (!dateString || dateString === "N/A" || dateString === "Not Attempted" || String(dateString).toLowerCase().includes("invalid date")) return "N/A";
    try {
        let cleanedDateString = dateString;
        if (String(dateString).includes(" GMT")) {
            cleanedDateString = dateString.substring(0, dateString.indexOf(" GMT"));
        }
        const date = new Date(cleanedDateString);
        if (isNaN(date.getTime())) {
             const parts = cleanedDateString.split(/[-/T\s:]/);
             if (parts.length >=3) {
                 const year = parseInt(parts[0]);
                 const month = parseInt(parts[1]) -1;
                 const day = parseInt(parts[2]);
                 const composedDate = new Date(Date.UTC(year, month, day)); // Use UTC to avoid timezone shifts from just date
                 if (!isNaN(composedDate.getTime())) {
                     return `${composedDate.getUTCDate()} ${composedDate.toLocaleString('default', { month: 'short', timeZone: 'UTC' })}, ${composedDate.getUTCFullYear()}`;
                 }
             }
            console.warn("Could not format date (attempt 1):", dateString);
            return String(dateString).split(" ")[0] || "N/A";
        }
        // Use UTC methods to avoid timezone discrepancies if only date is important
        const day = date.getUTCDate();
        const month = date.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
        const year = date.getUTCFullYear();
        return `${day} ${month}, ${year}`;
    } catch (e) {
        console.warn("Could not format date (attempt 2):", dateString, e);
        return String(dateString).split(" ")[0] || "N/A";
    }
}


document.addEventListener('DOMContentLoaded', function () {
    let loggedInStudentGmailID = localStorage.getItem('loggedInStudentGmailID');
    if (!loggedInStudentGmailID) {
        loggedInStudentGmailID = prompt("Enter your Student Gmail ID for testing (e.g., ali.khan@example.pk):");
        if (loggedInStudentGmailID) {
            localStorage.setItem('loggedInStudentGmailID', loggedInStudentGmailID);
        } else {
            document.body.innerHTML = "<p>Student Gmail ID is required to view the dashboard. Please refresh and enter an ID.</p>";
            return;
        }
    }
    loadAndProcessData(loggedInStudentGmailID);
    setupEventListeners();
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

    window.switchMainTab = function(tabElementOrName) { // Made global for overview activation
        let targetTabName;
        if(typeof tabElementOrName === 'string') {
            targetTabName = tabElementOrName;
        } else {
            targetTabName = tabElementOrName.getAttribute('data-main-tab');
        }

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
        if (targetContentId === 'overview-content' && currentStudentData.isDataAvailable) {
            initializeOverviewCharts(currentStudentData); 
        }
        
        // Activate first sub-tab if content is newly shown
        if (targetElement && !targetElement.dataset.subTabsInitialized) {
            const firstSubTab = targetElement.querySelector('.sub-tab-button');
            if (firstSubTab) {
                firstSubTab.click();
            }
            targetElement.dataset.subTabsInitialized = true; 
        }

        if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
            mobileMenu.classList.add('hidden');
        }
    }

    mainTabs.forEach(tab => {
        tab.addEventListener('click', () => switchMainTab(tab));
    });

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            switchMainTab(link);
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
}

async function loadAndProcessData(loggedInStudentGmailID) {
    if (!loggedInStudentGmailID) {
        console.error("No logged-in student Gmail ID provided.");
        document.getElementById('studentNameDisplay').textContent = `Welcome! Please log in.`;
        return;
    }
    console.log("Fetching data for student:", loggedInStudentGmailID);
    document.getElementById('studentNameDisplay').textContent = `Loading data for ${loggedInStudentGmailID}...`;


    try {
        const [aggregatedResponse, questionsResponse] = await Promise.all([
            fetch(AGGREGATED_SCORES_CSV_URL),
            fetch(QUESTION_DETAILS_CSV_URL)
        ]);

        if (!aggregatedResponse.ok || !questionsResponse.ok) {
            let errorMsg = "Error loading data: ";
            if (!aggregatedResponse.ok) errorMsg += `Aggregated Scores CSV (${aggregatedResponse.status} ${aggregatedResponse.statusText}). `;
            if (!questionsResponse.ok) errorMsg += `Question Details CSV (${questionsResponse.status} ${questionsResponse.statusText}).`;
            console.error(errorMsg);
            alert(errorMsg + " Please check the console and ensure the CSV URLs are correct and publicly accessible.");
            document.getElementById('studentNameDisplay').textContent = `Failed to load data.`;
            return;
        }
        
        const aggregatedCsvText = await aggregatedResponse.text();
        const questionsCsvText = await questionsResponse.text();

        const aggregatedResult = Papa.parse(aggregatedCsvText, { header: true, skipEmptyLines: true, dynamicTyping: true });
        const questionsResult = Papa.parse(questionsCsvText, { header: true, skipEmptyLines: true, dynamicTyping: true });
        
        allAggregatedData = aggregatedResult.data;
        allQuestionDetailsData = questionsResult.data;

        console.log("Aggregated Data Raw (first 5):", allAggregatedData.slice(0,5));
        console.log("Question Details Raw (first 5):", allQuestionDetailsData.slice(0,5));

        currentStudentData = transformDataForDashboard(allAggregatedData, allQuestionDetailsData, loggedInStudentGmailID);
        
        if (currentStudentData && currentStudentData.isDataAvailable) {
            displayData(currentStudentData);
             // Activate overview tab by default after data is processed and displayed
            if (typeof switchMainTab === 'function') {
                switchMainTab("overview");
            } else {
                console.error("switchMainTab function not available globally.");
                 // Fallback if needed, though making it global is better
                document.querySelector('.main-tab-button[data-main-tab="overview"]')?.click();
            }
        } else {
            console.error("No data found or processed for student:", loggedInStudentGmailID);
            alert(`No performance data found for student Gmail ID: ${loggedInStudentGmailID}. Please check the ID or the data source.`);
            const studentNameToDisplay = (currentStudentData && currentStudentData.name && currentStudentData.name !== loggedInStudentGmailID) ? currentStudentData.name : loggedInStudentGmailID;
            document.getElementById('studentNameDisplay').textContent = `Welcome, ${studentNameToDisplay} (No performance data found)`;
        }

    } catch (error) {
        console.error("Error loading or parsing CSV data:", error);
        alert("A critical error occurred while loading dashboard data. Please check the console for details.");
        document.getElementById('studentNameDisplay').textContent = `Error loading data.`;
    }
}

function cleanAssessmentName(assessmentName) {
    if (typeof assessmentName !== 'string') return "Unknown Assessment";
    // Remove prefixes like R-EOC-C#- or M-EOC-C#- etc.
    return assessmentName.replace(/^[RWM]-EOC-C\d+-/, '').replace(/^-/, '').trim();
}


function transformDataForDashboard(aggregatedDataArray, questionDetailsArray, loggedInStudentGmailID) {
    const studentAggregated = aggregatedDataArray.filter(row => row.StudentGmailID === loggedInStudentGmailID);
    const studentQuestions = questionDetailsArray.filter(row => row.StudentGmailID === loggedInStudentGmailID);

    // Attempt to get student name from the first aggregated row if available, else default to Gmail ID
    let studentDisplayName = loggedInStudentGmailID;
    if (studentAggregated.length > 0 && studentAggregated[0].StudentName_Full) { // Check for StudentName_Full
        studentDisplayName = studentAggregated[0].StudentName_Full;
    } else if (studentAggregated.length > 0 && studentAggregated[0].StudentName_Canvas) { // Fallback
        studentDisplayName = studentAggregated[0].StudentName_Canvas;
    }
    // Note: True student name mapping should ideally happen when Student_Mapping.csv is accessible client-side or included in feed by Apps Script.

    if (studentAggregated.length === 0) {
        console.warn("No aggregated data found for student:", loggedInStudentGmailID);
        return { 
            name: studentDisplayName, 
            isDataAvailable: false 
        }; 
    }

    let transformed = {
        name: studentDisplayName,
        targetScore: "N/A", // Placeholder - needs to come from Student_Mapping or similar
        latestScores: { total: "N/A", rw: "N/A", math: "N/A", avgEocPractice: "N/A" },
        classAveragesGlobal: { total: "N/A", rw: "N/A", math: "N/A", avgEocPractice: "N/A" },
        scoreTrend: { labels: [], studentScores: [], classAvgScores: [] },
        overallSkillPerformance: { labels: ['Reading', 'Writing & Language', 'Math'], studentAccuracy: [0, 0, 0], classAvgAccuracy: [0, 0, 0] },
        strengths: [],
        improvements: [],
        // timeSpent: { studentAvg: "N/A", studentUnit: "", classAvg: "N/A", classUnit: ""}, // Not directly available from feeds
        cbPracticeTests: [],
        eocQuizzes: { reading: [], writing: [], math: [] },
        khanAcademy: { reading: [], writing: [], math: [] },
        cbSkills: { reading: [], writing: [], math: [] },
        questionDetails: studentQuestions,
        isDataAvailable: true
    };
    
    // If StudentTargetScore was added to the feed (it's not by current Apps Script):
    // if (studentAggregated[0] && studentAggregated[0].StudentTargetScore) {
    //     transformed.targetScore = studentAggregated[0].StudentTargetScore;
    // }


    // --- Populate Latest Scores & Class Averages (Overview) ---
    const cbTestsStudent = studentAggregated.filter(r => r.AssessmentSource === 'Canvas CB Test');
    // Sort by date descending to get the latest. Ensure date parsing is robust.
    cbTestsStudent.sort((a,b) => {
        const dateA = new Date(a.AttemptDate);
        const dateB = new Date(b.AttemptDate);
        if (isNaN(dateA) && isNaN(dateB)) return 0;
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
    });

    if (cbTestsStudent.length > 0) {
        const latestTest = cbTestsStudent[0];
        transformed.latestScores.total = latestTest.ScaledScore_Total || "N/A";
        transformed.latestScores.rw = latestTest.ScaledScore_RW || "N/A";
        transformed.latestScores.math = latestTest.ScaledScore_Math || "N/A";
        // Use the ClassAverageScore_Normalized from this latest test for the overview
        transformed.classAveragesGlobal.total = latestTest.ClassAverageScore_Normalized || "N/A";
        // Specific R&W/Math scaled class averages are not in the feed, so these remain N/A
        transformed.classAveragesGlobal.rw = "N/A"; 
        transformed.classAveragesGlobal.math = "N/A";
    }

    const studentEocEntries = studentAggregated.filter(r => r.AssessmentSource === 'Canvas EOC Practice' && r.Score_Percentage);
    const studentEocPercentages = studentEocEntries.map(r => parseFloat(String(r.Score_Percentage).replace('%', ''))).filter(p => !isNaN(p));
    if (studentEocPercentages.length > 0) {
        transformed.latestScores.avgEocPractice = (studentEocPercentages.reduce((a,b) => a + b, 0) / studentEocPercentages.length).toFixed(0) + '%';
    }
    
    // Calculate overall Class Average EOC Practice Score from *all* EOC entries in the feed
    const allEocClassAvgsPercentages = allAggregatedData
        .filter(r => r.AssessmentSource === 'Canvas EOC Practice' && r.ClassAverageScore_Normalized && String(r.ClassAverageScore_Normalized).includes('%'))
        .map(r => parseFloat(String(r.ClassAverageScore_Normalized).replace('%', '')))
        .filter(p => !isNaN(p));
    if (allEocClassAvgsPercentages.length > 0) {
        transformed.classAveragesGlobal.avgEocPractice = (allEocClassAvgsPercentages.reduce((a,b) => a+b, 0) / allEocClassAvgsPercentages.length).toFixed(0) + '%';
    }


    // --- Populate Score Trend ---
    cbTestsStudent.slice().reverse().forEach(test => { // Use student's CB tests, chronological
        transformed.scoreTrend.labels.push(test.AssessmentName);
        transformed.scoreTrend.studentScores.push(parseFloat(test.ScaledScore_Total) || null); // Use null for Chart.js to break line
        const classAvgNorm = parseFloat(String(test.ClassAverageScore_Normalized).replace('%',''));
        transformed.scoreTrend.classAvgScores.push( !isNaN(classAvgNorm) ? (classAvgNorm / 100 * 1600) : null ); // Approximate scaled
    });


    // --- Populate Overall Skill Performance & Strengths/Improvements (Basic - relies on good skill tags) ---
    const skillToCategory = (skillTag) => {
        if (!skillTag || typeof skillTag !== 'string') return 'Unknown';
        const tag = skillTag.toLowerCase().trim();
        if (tag === 'tbd' || tag.startsWith('tbd_')) return 'Unknown'; 
        // Example keywords - THIS MAPPING NEEDS TO BE ACCURATE FOR YOUR SKILL TAGS
        if (tag.includes('read') || tag.includes('vocab') || tag.includes('evidence') || tag.includes('info') || tag.includes('idea') || tag.includes('inference') || tag.includes('purpose') || tag.includes('rhetoric')) return 'Reading';
        if (tag.includes('writ') || tag.includes('lang') || tag.includes('gramm') || tag.includes('expression') || tag.includes('convention') || tag.includes('sentence structure') || tag.includes('punctuation')) return 'Writing & Language';
        if (tag.includes('math') || tag.includes('alg') || tag.includes('geom') || tag.includes('data an') || tag.includes('adv math') || tag.includes('problem solv') || tag.includes('equation') || tag.includes('function')) return 'Math';
        return 'Unknown'; // Default if no keywords match
    };

    const studentSkillPerformance = { Reading: { correct: 0, total: 0 }, 'Writing & Language': { correct: 0, total: 0 }, Math: { correct: 0, total: 0 }, Unknown: {correct: 0, total: 0} };
    const classSkillPerformanceCalc = { Reading: { totalPoints: 0, totalPossible: 0, numQuestions: 0 }, 'Writing & Language': { totalPoints: 0, totalPossible: 0, numQuestions: 0 }, Math: { totalPoints: 0, totalPossible: 0, numQuestions: 0 }, Unknown: {totalPoints: 0, totalPossible: 0, numQuestions: 0}};
    const granularSkills = {}; 

    studentQuestions.forEach(q => {
        const category = skillToCategory(q.SAT_Skill_Tag);
        const pointsPossible = parseFloat(q.PointsPossible_Question) || 1;
        const pointsEarned = parseFloat(q.PointsEarned) || 0;
        const classAvgPoints = parseFloat(q.ClassAveragePoints_Question);

        studentSkillPerformance[category].correct += pointsEarned;
        studentSkillPerformance[category].total += pointsPossible;

        if (!isNaN(classAvgPoints)) {
             classSkillPerformanceCalc[category].totalPoints += classAvgPoints * (allAggregatedData.filter(r => r.AssessmentName === q.AssessmentName).length / studentAggregated.filter(r => r.AssessmentName === q.AssessmentName).length || 1); // rough weight
             classSkillPerformanceCalc[category].totalPossible += pointsPossible;
             classSkillPerformanceCalc[category].numQuestions++;
        }
        
        const skillTag = q.SAT_Skill_Tag;
        if (skillTag && !String(skillTag).toUpperCase().startsWith('TBD') && String(skillTag).trim() !== '') {
            if (!granularSkills[skillTag]) {
                granularSkills[skillTag] = { studentCorrect: 0, studentTotal: 0, classCorrectPercentageSum: 0, questions: 0 };
            }
            granularSkills[skillTag].studentCorrect += pointsEarned;
            granularSkills[skillTag].studentTotal += pointsPossible;
            if (!isNaN(classAvgPoints) && pointsPossible > 0) {
                 granularSkills[skillTag].classCorrectPercentageSum += (classAvgPoints / pointsPossible * 100);
                 granularSkills[skillTag].questions++;
            }
        }
    });

    transformed.overallSkillPerformance.studentAccuracy = [
        studentSkillPerformance.Reading.total > 0 ? (studentSkillPerformance.Reading.correct / studentSkillPerformance.Reading.total * 100) : 0,
        studentSkillPerformance['Writing & Language'].total > 0 ? (studentSkillPerformance['Writing & Language'].correct / studentSkillPerformance['Writing & Language'].total * 100) : 0,
        studentSkillPerformance.Math.total > 0 ? (studentSkillPerformance.Math.correct / studentSkillPerformance.Math.total * 100) : 0
    ].map(s => parseFloat(s.toFixed(0)));
    
    transformed.overallSkillPerformance.classAvgAccuracy = [
        classSkillPerformanceCalc.Reading.totalPossible > 0 ? (classSkillPerformanceCalc.Reading.totalPoints / classSkillPerformanceCalc.Reading.totalPossible * 100) : 0,
        classSkillPerformanceCalc['Writing & Language'].totalPossible > 0 ? (classSkillPerformanceCalc['Writing & Language'].totalPoints / classSkillPerformanceCalc['Writing & Language'].totalPossible * 100) : 0,
        classSkillPerformanceCalc.Math.totalPossible > 0 ? (classSkillPerformanceCalc.Math.totalPoints / classSkillPerformanceCalc.Math.totalPossible * 100) : 0,
    ].map(s => parseFloat(s.toFixed(0)));


    const skillDetailsArray = [];
    for (const skillName in granularSkills) {
        const data = granularSkills[skillName];
        const studentAccuracy = data.studentTotal > 0 ? (data.studentCorrect / data.studentTotal * 100) : 0;
        const classAccuracy = data.questions > 0 ? (data.classCorrectPercentageSum / data.questions) : 0; // Avg of percentages
        skillDetailsArray.push({ name: skillName, studentAccuracy, classAccuracy, diff: studentAccuracy - classAccuracy });
    }
    skillDetailsArray.sort((a,b) => b.diff - a.diff); 
    transformed.strengths = skillDetailsArray.filter(s => s.diff > 5 && s.studentAccuracy > 60).slice(0, 5).map(s => `${s.name} (${s.studentAccuracy.toFixed(0)}%)`); // Adjusted threshold
    skillDetailsArray.sort((a,b) => a.diff - b.diff); 
    transformed.improvements = skillDetailsArray.filter(s => s.diff < -5 && s.studentAccuracy < 70).slice(0, 5).map(s => `${s.name} (${s.studentAccuracy.toFixed(0)}%)`); // Adjusted threshold


    // --- Populate CB Practice Tests Table ---
    studentAggregated
        .filter(row => row.AssessmentSource === 'Canvas CB Test' || row.AssessmentSource === 'Canvas CB Module')
        .forEach(row => {
            transformed.cbPracticeTests.push({
                name: row.AssessmentName,
                date: formatDate(row.AttemptDate),
                rw: row.ScaledScore_RW || '-',
                math: row.ScaledScore_Math || '-',
                total: row.ScaledScore_Total || '-',
                classAvgRW: "N/A", // Not in current feed
                classAvgMath: "N/A", // Not in current feed
                classAvgTotal: row.ClassAverageScore_Normalized || '-'
            });
    });
    transformed.cbPracticeTests.sort((a,b) => {
        // Robust date sort: invalid dates or "N/A" go last
        const dateA = new Date(a.date === "N/A" ? 0 : a.date); // Treat N/A as very old date for sorting
        const dateB = new Date(b.date === "N/A" ? 0 : b.date);
        const validA = !isNaN(dateA.getTime()) && a.date !== "N/A";
        const validB = !isNaN(dateB.getTime()) && b.date !== "N/A";

        if (validA && validB) return dateB - dateA; // Sort by date descending
        if (validA) return -1; // Valid dates first
        if (validB) return 1;  // Valid dates first
        return a.name.localeCompare(b.name); // Fallback to name sort
    });


    // --- Populate EOC Quizzes, Khan Academy by Subject ---
    // Helper to try and infer subject from assessment name
    const inferSubject = (assessmentName) => {
        const nameLower = assessmentName.toLowerCase();
        if (nameLower.startsWith('r-eoc') || nameLower.includes('reading')) return 'reading';
        if (nameLower.startsWith('w-eoc') || nameLower.includes('writing')) return 'writing';
        if (nameLower.startsWith('m-eoc') || nameLower.includes('math')) return 'math';
        return null; // Could not infer
    };
    
    // Populate EOC with all chapters, marking N/A for unattempted
    Object.keys(eocChapters).forEach(subject => {
        transformed.eocQuizzes[subject] = eocChapters[subject].map(chapterName => {
            const attempt = studentAggregated.find(row => 
                row.AssessmentSource === 'Canvas EOC Practice' && 
                cleanAssessmentName(row.AssessmentName) === chapterName &&
                (inferSubject(row.AssessmentName) === subject || !inferSubject(row.AssessmentName) /* fallback if no prefix */ )
            );
            if (attempt) {
                return {
                    name: chapterName, // Use cleaned chapter name
                    latestScore: `${attempt.Score_Percentage || 'N/A'} (${attempt.Score_Raw_Combined || 'N/A'}/${attempt.PointsPossible_Combined || 'N/A'})`,
                    classAvg: attempt.ClassAverageScore_Normalized || "N/A",
                    date: formatDate(attempt.AttemptDate)
                };
            } else {
                return { name: chapterName, latestScore: "N/A", classAvg: "N/A", date: "N/A" };
            }
        });
    });

    studentAggregated.forEach(row => {
        const subject = inferSubject(row.AssessmentName);
        if (row.AssessmentSource === 'Khan Academy Practice' && subject && transformed.khanAcademy[subject]) {
            transformed.khanAcademy[subject].push({
                name: row.AssessmentName,
                date: formatDate(row.AttemptDate),
                score: `${row.Score_Raw_Combined || 'N/A'}/${row.PointsPossible_Combined || 'N/A'} (${row.Score_Percentage || 'N/A'})`,
                pointsPossible: row.PointsPossible_Combined || "N/A",
                classAvg: row.ClassAverageScore_Normalized || "N/A"
            });
        }
    });
    
    // Populate CB Skills (from granularSkills derived from questionDetails)
    for (const skillName in granularSkills) {
        const data = granularSkills[skillName];
        const category = skillToCategory(skillName); // Use the same mapping
        if (category !== 'Unknown' && transformed.cbSkills[category]) {
             transformed.cbSkills[category].push({
                name: skillName,
                score: parseFloat(data.studentTotal > 0 ? (data.studentCorrect / data.studentTotal * 100).toFixed(0) : 0),
                classAvg: parseFloat(data.questions > 0 ? (data.classCorrectPercentageSum / data.questions).toFixed(0) : 0)
            });
        }
    }

    console.log("Transformed currentStudentData (final):", JSON.parse(JSON.stringify(transformed))); // Deep copy for logging
    return transformed;
}


function displayData(studentData) {
    if (!studentData || !studentData.isDataAvailable) {
        console.warn("No data available to display for student or student data incomplete.");
        const nameToDisplay = (studentData && studentData.name) ? studentData.name : (localStorage.getItem('loggedInStudentGmailID') || "Guest");
        document.getElementById('studentNameDisplay').textContent = `Welcome, ${nameToDisplay}! (No performance data found)`;
        
        document.getElementById('overview-content').innerHTML = "<p class='text-center p-4 text-gray-600'>No performance data currently available for this student.</p>";
        document.getElementById('cb-practice-tests-table-body').innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-3">No CB Practice Test data available.</td></tr>`;
        ['reading', 'writing', 'math'].forEach(subject => {
            document.getElementById(`${subject}-eoc-tbody`) ? document.getElementById(`${subject}-eoc-tbody`).innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-3">No EOC data.</td></tr>` : null;
            document.getElementById(`${subject}-khan-data`) ? document.getElementById(`${subject}-khan-data`).innerHTML = `<p class="text-gray-500 p-3">No Khan data.</p>` : null;
            document.getElementById(`${subject}-cb-skills-data`) ? document.getElementById(`${subject}-cb-skills-data`).innerHTML = `<p class="text-gray-500 p-3">No Skill data.</p>` : null;
        });
        return;
    }

    document.getElementById('studentNameDisplay').textContent = `Welcome, ${studentData.name}!`;
    
    const overviewSnapshotDiv = document.getElementById('overview-content').querySelector('.grid.grid-cols-1');
    if (overviewSnapshotDiv && overviewSnapshotDiv.children.length >= 5) {
        const cards = overviewSnapshotDiv.children;
        cards[0].querySelector('.score-value').innerHTML = `${studentData.latestScores.total || 'N/A'} <span class="text-lg text-gray-500">/ 1600</span>`;
        cards[0].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.total || 'N/A'}`;
        
        cards[1].querySelector('.score-value').innerHTML = `${studentData.latestScores.rw || 'N/A'} <span class="text-lg text-gray-500">/ 800</span>`;
        cards[1].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.rw || 'N/A'}`;
        
        cards[2].querySelector('.score-value').innerHTML = `${studentData.latestScores.math || 'N/A'} <span class="text-lg text-gray-500">/ 800</span>`;
        cards[2].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.math || 'N/A'}`;
        
        cards[3].querySelector('.score-value').textContent = studentData.latestScores.avgEocPractice || 'N/A';
        cards[3].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.avgEocPractice || 'N/A'}`;

        cards[4].querySelector('.text-3xl').textContent = studentData.targetScore || 'N/A';
        const latestTotalNum = parseFloat(studentData.latestScores.total);
        const targetNum = parseFloat(studentData.targetScore);
        if (!isNaN(latestTotalNum) && !isNaN(targetNum) && targetNum > latestTotalNum) {
            cards[4].querySelector('.text-sm').textContent = `Goal: +${targetNum - latestTotalNum} points`;
        } else if (!isNaN(targetNum)) {
             cards[4].querySelector('.text-sm').textContent = `Target is set.`;
        } else {
             cards[4].querySelector('.text-sm').textContent = `Set a target!`;
        }
    }


    populateOverviewSnapshot(studentData); 
    initializeOverviewCharts(studentData); // Moved here to ensure charts are drawn after data is ready and overview tab might be active
    populatePracticeTestsTable(studentData.cbPracticeTests);
    
    ['reading', 'writing', 'math'].forEach(subject => {
        populateEOCTable(subject, studentData.eocQuizzes[subject] || []);
        populateKhanSection(subject, studentData.khanAcademy[subject] || []);
        populateCBSkills(subject, studentData.cbSkills[subject] || []);
    });
}


// Existing chart instances - keep these global
let scoreTrendChartInstance = null; 
let overallSkillChartInstance = null;
let modalDonutChartInstance = null; 
let modalLineChartInstance = null; 

function populateOverviewSnapshot(studentData) { 
    const overviewStrengthsList = document.getElementById('overviewStrengthsList'); 
    const overviewImprovementsList = document.getElementById('overviewImprovementsList');
    const timeSpentOverviewDiv = document.getElementById('timeSpentOverview');
    
    if(overviewStrengthsList) {
        overviewStrengthsList.innerHTML = ''; 
        (studentData.strengths || []).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            overviewStrengthsList.appendChild(li);
        });
        if ((studentData.strengths || []).length === 0) overviewStrengthsList.innerHTML = '<li>No specific strengths identified yet. Keep practicing!</li>';
    }
    if(overviewImprovementsList) {
        overviewImprovementsList.innerHTML = ''; 
        (studentData.improvements || []).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            overviewImprovementsList.appendChild(li);
        });
         if ((studentData.improvements || []).length === 0) overviewImprovementsList.innerHTML = '<li>No specific improvement areas identified yet. Great work!</li>';
    }
    // Time spent card - not populated from current feeds
    if(timeSpentOverviewDiv) {
        timeSpentOverviewDiv.innerHTML = `<p class="text-gray-600">Your Avg: <span class="font-semibold">N/A</span></p><p class="text-gray-600">Class Avg: <span class="font-semibold">N/A</span></p><p class="text-xs text-gray-400">(Overall portal usage data not available)</p>`;
    }
}

function initializeOverviewCharts(studentData) {
    if (!studentData.isDataAvailable) return;
    const primaryChartColor = '#2a5266'; 
    const secondaryChartColor = '#757575'; 
    const barChartPrimaryBg = 'rgba(42, 82, 102, 0.8)'; 
    const barChartSecondaryBg = 'rgba(117, 117, 117, 0.7)';
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' }}}; // maintainAspectRatio: false
    
    const scoreTrendCtx = document.getElementById('scoreTrendChart')?.getContext('2d');
    if (scoreTrendCtx) {
        if (scoreTrendChartInstance) scoreTrendChartInstance.destroy();
        scoreTrendChartInstance = new Chart(scoreTrendCtx, { 
            type: 'line', 
            data: { 
                labels: studentData.scoreTrend.labels, 
                datasets: [
                    { label: 'Your Total Score', data: studentData.scoreTrend.studentScores, borderColor: primaryChartColor, tension: 0.1, fill: false },
                    { label: 'Class Average Approx. Scaled', data: studentData.scoreTrend.classAvgScores, borderColor: secondaryChartColor, tension: 0.1, borderDash: [5, 5], fill: false }
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
                    { label: 'Class Average Accuracy (Approx.)', data: studentData.overallSkillPerformance.classAvgAccuracy, backgroundColor: barChartSecondaryBg }
                ] 
            }, 
            options: { ...chartOptions, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: function(value) { return value + "%" } } } } } 
        });
    }
}

function populatePracticeTestsTable(testsData) {
    const cbTableBody = document.getElementById('cb-practice-tests-table-body');
    if (!cbTableBody) return;
    cbTableBody.innerHTML = ''; 
    if (!testsData || testsData.length === 0) {
        cbTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-3">No CB Practice Test data available for this student.</td></tr>`;
        return;
    }
    testsData.forEach(test => {
        const row = cbTableBody.insertRow();
        row.className = 'clickable-row';
        row.innerHTML = `<td>${test.name}</td><td>${test.date}</td><td>${test.rw}</td><td>${test.math}</td><td>${test.total}</td><td>${test.classAvgRW}</td><td>${test.classAvgMath}</td><td>${test.classAvgTotal}</td>`;
        row.onclick = () => openModal(`${test.name} Details`, { type: 'cb_test', assessmentName: test.name });
    });
}

function populateEOCTable(sectionKey, eocQuizDataForSubject) {
    const tbody = document.getElementById(`${sectionKey}-eoc-tbody`);
    const thead = document.getElementById(`${sectionKey}-eoc-thead`);
    if (!tbody || !thead) return;
    
    thead.innerHTML = `<tr><th>Chapter/Practice Name</th><th>Your Score</th><th>Date Attempted</th><th>Class Avg Score</th></tr>`;
    tbody.innerHTML = ''; 

    if (!eocQuizDataForSubject || eocQuizDataForSubject.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-3">No EOC Practice data available for ${sectionKey}.</td></tr>`;
        return;
    }
    eocQuizDataForSubject.forEach(item => { // item already contains pre-defined chapters with N/A if not attempted
        const row = tbody.insertRow();
        if (item.latestScore !== "N/A") { // Only make rows with actual scores clickable
            row.className = 'clickable-row';
            row.onclick = () => openModal(`EOC Practice: ${item.name}`, { type: 'eoc_quiz', assessmentName: item.originalName || item.name }); // Use originalName if available for lookup
        }
        row.innerHTML = `<td>${item.name}</td><td>${item.latestScore}</td><td>${item.date}</td><td>${item.classAvg}</td>`;
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
            row.onclick = () => openModal(`Khan Academy: ${item.name}`, { type: 'khan', assessmentName: item.name });
        });
        container.appendChild(table);
    } else {
        container.innerHTML = `<p class="text-gray-600 p-3">No Khan Academy Practice data available for ${sectionKey}.</p>`;
    }
}

function getPerformanceClass(score) {
    if (score >= 85) return 'performance-good';
    if (score >= 70) return 'performance-average';
    if (score > 0) return 'performance-poor'; // only apply poor if score > 0 but < 70
    return 'bg-gray-200'; // Default for N/A or 0 scores
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
            const textColorClass = studentScore > 0 ? performanceClass.replace('performance-', 'text-') : 'text-gray-500';
            
            skillDiv.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm font-medium text-gray-800">${skill.name || 'Unknown Skill'}</span>
                    <span class="text-xs ${textColorClass} font-semibold">${studentScore}%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar ${performanceClass}" style="width: ${studentScore}%"></div>
                </div>
                <p class="text-xs text-gray-500 mt-1">Class Avg: ${classAverage}%</p>`;
            container.appendChild(skillDiv);
        });
    } else {
         container.innerHTML = `<p class="text-gray-500 p-3">No Skill data available for ${sectionKey}. Ensure SAT skill tags are well-populated in the source data.</p>`;
    }
}

const modal = document.getElementById('detailModal');
const modalQuestionDetailsContainer = document.getElementById('modalQuestionDetails');

function openModal(title, contentDetails) { 
    if (!modal || !modalQuestionDetailsContainer || !currentStudentData.questionDetails) return;
    
    const modalHeaderH2 = modal.querySelector('.modal-header h2'); 
    if(modalHeaderH2) modalHeaderH2.textContent = title;
    
    modalQuestionDetailsContainer.innerHTML = ''; 
    
    const assessmentNameForFilter = contentDetails.assessmentName;
    // The EOC table now passes the cleaned chapter name for display 'item.name', but we need original for filtering if different
    // We will assume contentDetails.assessmentName is the one to filter questionDetails by.
    
    const studentQuestionDataForAssessment = currentStudentData.questionDetails.filter(q => {
        // Need to handle cases where AssessmentName in questionDetails might have prefixes
        // For now, direct match. This might need adjustment if EOC names in questionDetails are prefixed.
        return q.AssessmentName === assessmentNameForFilter;
    });

    if (studentQuestionDataForAssessment.length === 0) {
        modalQuestionDetailsContainer.innerHTML = '<p>No detailed question data available for this specific assessment item.</p>';
    } else {
        studentQuestionDataForAssessment.forEach((q, i) => {
            const d = document.createElement('div');
            let statusText, statusClass;
            const isCorrect = String(q.IsCorrect).toLowerCase() === 'true'; // IsCorrect from feed is boolean
            const studentAnswer = q.StudentAnswer !== null && q.StudentAnswer !== undefined ? String(q.StudentAnswer) : "N/A";

            if (studentAnswer === "N/A") { 
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
                const classCorrectPercent = (classAvgPoints / pointsPossible * 100);
                classCorrectPercentText = `${classCorrectPercent.toFixed(0)}% ${classCorrectPercent > 75 ? '<span class="arrow-up">↑</span>' : (classCorrectPercent < 50 ? '<span class="arrow-down">↓</span>' : '')}`;
            }

            d.className = `p-2 border rounded-md ${statusClass}`;
            d.innerHTML = `
                <p class="font-medium text-gray-700">Q${q.QuestionSequenceInQuiz || (i+1)}: ${q.QuestionText_fromMetadata || 'N/A'}</p>
                <p>Your Answer: <span class="font-semibold">${studentAnswer}</span> (${statusText})</p>
                <p>Points: ${q.PointsEarned !== null ? q.PointsEarned : 0} / ${pointsPossible}</p>
                <p>Skill: ${q.SAT_Skill_Tag || 'N/A'}</p>
                <p class="text-xs text-gray-500">Class Avg Performance: ${classCorrectPercentText}</p>`; // Changed label slightly
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
        const studentAnswer = q.StudentAnswer !== null && q.StudentAnswer !== undefined ? String(q.StudentAnswer) : "N/A";
        if (studentAnswer === "N/A") unansweredCount++;
        else if (isCorrect) correctCount++;
        else incorrectCount++;
    });
    
    const donutCtx = document.getElementById('modalDonutChart')?.getContext('2d');
    if (donutCtx) { 
        modalDonutChartInstance = new Chart(donutCtx,{type:'doughnut',data:{labels:['Correct','Incorrect','Unanswered'],datasets:[{data:[correctCount, incorrectCount, unansweredCount],backgroundColor:['#4caf50','#f44336','#9e9e9e'], hoverOffset: 4}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{position:'bottom'}},cutout:'50%'}});
    }

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
