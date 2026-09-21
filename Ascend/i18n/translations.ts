// Translation dictionary. Keys are used with the t() helper from
// LanguageContext.tsx, e.g. t('dailyQuests'). English only — the app used to
// offer 20 languages; that selector was removed and every other language's
// dictionary along with it, so there's exactly one table to keep in sync
// with the app's copy instead of twenty.

export type LanguageCode = 'en';

type TranslationKey =
  | 'goodMorning'
  | 'editProfile'
  | 'settings'
  | 'profileSection'
  | 'bodyStatsSection'
  | 'goalsSection'
  | 'logOut'
  | 'dailyQuests'
  | 'today'
  | 'calories'
  | 'workouts'
  | 'water'
  | 'sleep'
  | 'logWater'
  | 'logSleep'
  | 'save'
  | 'cancel'
  | 'add'
  | 'add_food'
  | 'back'
  | 'welcomeBack'
  | 'createAccount'
  | 'email'
  | 'password'
  | 'signUp'
  | 'logIn'
  | 'nextQuestReset'
  | 'beforeDayEnds'
  | 'allDoneToday'
  | 'errorSaveFailed'
  | 'profileSaved'
  | 'errorLoadFailed'
  | 'level'
  | 'saving'
  | 'pleaseWait'
  | 'chooseProfilePicture'
  | 'presetAvatars'
  | 'uploadPhoto'
  | 'removePhoto'
  | 'avatarColor'
  | 'useDefaultColor'
  | 'weight'
  | 'logWeight'
  | 'weightPrompt'
  | 'noWeightYet'
  | 'streakLabel'
  | 'bestStreak'
  | 'daySingular'
  | 'dayPlural'
  | 'autoTracked'
  | 'history'
  | 'last7Days'
  | 'noHistoryYet'
  | 'leaderboard'
  | 'leaderboardSubtitle'
  | 'leaderboardEmpty'
  | 'leaderboardUnavailable'
  | 'leaderboardPrivacy'
  | 'yourPosition'
  | 'outOf'
  | 'you'
  | 'welcomeTagline'
  | 'getStarted'
  | 'iHaveAccount'
  | 'chooseMuscleGroup'
  | 'sets'
  | 'reps'
  | 'completeSet'
  | 'complete'
  | 'workoutComplete'
  | 'youEarned'
  | 'backToDashboard'
  | 'getReady'
  | 'rest'
  | 'skipRest'
  | 'secondsGrace'
  | 'secondsRest'
  | 'searchTab'
  | 'customTab'
  | 'combineTab'
  | 'searchPlaceholder'
  | 'foodNamePlaceholder'
  | 'quantityServings'
  | 'addFood'
  | 'nutrition'
  | 'todaysFood'
  | 'noFoodLogged'
  | 'kcalRemaining'
  | 'kcalOverGoal'
  | 'stepOf'
  | 'next'
  | 'finish'
  | 'firstName'
  | 'lastInitial'
  | 'age'
  | 'heightFt'
  | 'heightIn'
  | 'weightLbs'
  | 'gender'
  | 'activityLevel'
  | 'goal'
  | 'male'
  | 'female'
  | 'other'
  | 'height'
  | 'onboardingNameTitle'
  | 'onboardingNameSubtitle'
  | 'onboardingBodySubtitle'
  | 'onboardingAboutTitle'
  | 'onboardingAboutSubtitle'
  | 'onboardingGoalTitle'
  | 'onboardingGoalSubtitle'
  | 'onboardingReadyTitle'
  | 'onboardingReadySubtitle'
  | 'onboardingDobTitle'
  | 'onboardingDobSubtitle'
  | 'onboardingGenderSubtitle'
  | 'onboardingActivitySubtitle'
  | 'onboardingPhysicalTitle'
  | 'onboardingPhysicalSubtitle'
  | 'uploadFailed'
  | 'uploadFailedBody'
  | 'permissionNeeded'
  | 'permissionBody'
  | 'notificationsSection'
  | 'streakReminders'
  | 'streakRemindersHint'
  | 'friendsTitle'
  | 'yourFriendCode'
  | 'friendCodeHint'
  | 'shareCode'
  | 'addFriend'
  | 'enterFriendCode'
  | 'sending'
  | 'send'
  | 'friendRequests'
  | 'decline'
  | 'accept'
  | 'yourFriends'
  | 'noFriendsYet'
  | 'noFriendsYetHint'
  | 'remove'
  | 'challengeAction'
  | 'friendRequestSent'
  | 'friendCodeInvalid'
  | 'friendCodeSelf'
  | 'friendAlreadyAdded'
  | 'challengesTitle'
  | 'challengesSubtitle'
  | 'noChallengesYet'
  | 'noChallengesYetHint'
  | 'left'
  | 'youWon'
  | 'youLost'
  | 'itsATie'
  | 'friend'
  | 'challengeWorkoutsGoal'
  | 'challengeSent'
  | 'friendRequestAlreadyPending'
  | 'challengeAlreadyActive';

export const TRANSLATIONS: Record<LanguageCode, Partial<Record<TranslationKey, string>>> = {
  en: {
    goodMorning: 'Good morning',
    editProfile: 'Edit Profile',
    settings: 'Settings',
    profileSection: 'Profile',
    bodyStatsSection: 'Body Stats',
    goalsSection: 'Your Daily Targets',
    logOut: 'Log Out',
    dailyQuests: 'Daily Quests',
    today: 'Today',
    calories: 'Calories',
    workouts: 'Workouts',
    water: 'Water',
    sleep: 'Sleep',
    logWater: '+ Log Water',
    logSleep: 'Log Sleep',
    save: 'Save Changes',
    cancel: 'Cancel',
    add: 'Add',
    add_food: '+ Log Food',
    back: 'Back',
    welcomeBack: 'Welcome back',
    createAccount: 'Create your account',
    email: 'Email',
    password: 'Password',
    signUp: 'Sign Up',
    logIn: 'Log In',
    nextQuestReset: 'Quest resets in',
    beforeDayEnds: 'Still to go today',
    allDoneToday: "All done for today! 🎉",
    errorSaveFailed: "Couldn't save — check your connection and try again.",
    profileSaved: 'Profile saved',
    errorLoadFailed: "Couldn't load your data — check your connection.",
    level: 'Level',
    saving: 'Saving...',
    pleaseWait: 'Please wait...',
    chooseProfilePicture: 'Profile Picture',
    presetAvatars: 'Choose an avatar',
    uploadPhoto: 'Upload a photo',
    removePhoto: 'Remove photo',
    avatarColor: 'Avatar color',
    useDefaultColor: 'Use default',
    weight: 'Weight',
    logWeight: 'Log Weight',
    weightPrompt: "What's your weight today? (lbs)",
    noWeightYet: 'Not logged yet',
    streakLabel: 'streak',
    bestStreak: 'Best',
    daySingular: 'day',
    dayPlural: 'days',
    autoTracked: 'AUTO',
    history: 'History',
    last7Days: 'Last 7 days',
    noHistoryYet: 'No history yet — log some days first.',
    leaderboard: 'Leaderboard',
    leaderboardSubtitle: 'Top 50 by total XP',
    leaderboardEmpty: 'Nobody on the board yet — earn some XP to claim first place.',
    leaderboardUnavailable: "Couldn't load the leaderboard. If you just added it, make sure the Firestore rules are published.",
    leaderboardPrivacy: 'Only your first name, last initial, avatar, level and XP are public. Your weight, age, meals and email are never shared.',
    yourPosition: 'Your position',
    outOf: 'of',
    you: 'you',
    welcomeTagline: 'Level up your health.',
    getStarted: 'Get Started',
    iHaveAccount: 'I already have an account',
    chooseMuscleGroup: 'Choose a muscle group to train today.',
    sets: 'sets',
    reps: 'reps',
    completeSet: 'Complete Set',
    complete: 'Complete',
    workoutComplete: 'Workout Complete!',
    youEarned: 'You earned',
    backToDashboard: 'Back to Dashboard',
    getReady: 'Get Ready',
    rest: 'Rest',
    skipRest: 'Skip Rest',
    secondsGrace: 'seconds grace period',
    secondsRest: 'seconds rest',
    searchTab: 'Search',
    customTab: 'Custom',
    combineTab: 'Combine',
    searchPlaceholder: 'Search foods (e.g. chicken)',
    foodNamePlaceholder: 'Food name',
    quantityServings: 'Quantity (servings)',
    addFood: 'Add Food',
    nutrition: 'Nutrition',
    todaysFood: "Today's Food",
    noFoodLogged: 'No food logged yet. Tap + to add.',
    kcalRemaining: 'kcal remaining',
    kcalOverGoal: 'kcal over goal',
    stepOf: 'Step',
    next: 'Next',
    finish: 'Finish',
    firstName: 'First name',
    lastInitial: 'Last initial',
    age: 'Age',
    heightFt: 'Feet',
    heightIn: 'Inches',
    weightLbs: 'Weight (lbs)',
    gender: 'Gender',
    activityLevel: 'Activity Level',
    goal: 'Goal',
    male: 'Male',
    female: 'Female',
    other: 'Other',
    height: 'Height',
    onboardingNameTitle: "What's your name?",
    onboardingNameSubtitle: "We'll use this to personalize your experience.",
    onboardingBodySubtitle: 'Used to calculate your calorie targets.',
    onboardingAboutTitle: 'About you',
    onboardingAboutSubtitle: 'Helps us fine-tune your daily targets.',
    onboardingGoalTitle: "What's your goal?",
    onboardingGoalSubtitle: "We'll customize your quests around this.",
    onboardingReadyTitle: "You're all set",
    onboardingReadySubtitle: "Here's what your first day looks like.",
    onboardingDobTitle: 'When were you born?',
    onboardingDobSubtitle: 'Keeps your plan age-appropriate.',
    onboardingGenderSubtitle: 'Helps us fine-tune your daily targets.',
    onboardingActivitySubtitle: 'Helps us fine-tune your daily targets.',
    onboardingPhysicalTitle: 'Any physical considerations?',
    onboardingPhysicalSubtitle: 'Optional — helps us tailor your workouts safely.',
    uploadFailed: 'Upload failed',
    uploadFailedBody: "Couldn't upload that photo. Check your connection and try again — you can also pick a preset avatar instead.",
    permissionNeeded: 'Permission needed',
    permissionBody: 'Allow photo access to upload a profile picture.',
    notificationsSection: 'Notifications',
    streakReminders: 'Streak reminders',
    streakRemindersHint: 'A nudge in the evening if you still have quests left and a streak to protect.',
    friendsTitle: 'Friends',
    yourFriendCode: 'Your friend code',
    friendCodeHint: 'Share this code so a friend can add you.',
    shareCode: 'Share code',
    addFriend: 'Add a friend',
    enterFriendCode: 'Enter a friend code',
    sending: 'Sending…',
    send: 'Send',
    friendRequests: 'Friend requests',
    decline: 'Decline',
    accept: 'Accept',
    yourFriends: 'Your friends',
    noFriendsYet: 'No friends yet',
    noFriendsYetHint: "Share your code or enter a friend's to get started.",
    remove: 'Remove',
    challengeAction: 'Challenge',
    friendRequestSent: 'Friend request sent!',
    friendCodeInvalid: "That code doesn't match anyone.",
    friendCodeSelf: "That's your own code.",
    friendAlreadyAdded: "You're already friends.",
    challengesTitle: 'Challenges',
    challengesSubtitle: 'Friendly 1-on-1 competitions',
    noChallengesYet: 'No challenges yet',
    noChallengesYetHint: 'Challenge a friend from the Friends screen to get started.',
    left: 'left',
    youWon: 'You won!',
    youLost: 'You lost',
    itsATie: "It's a tie",
    friend: 'Friend',
    challengeWorkoutsGoal: 'Most workouts this week',
    challengeSent: 'Challenge sent!',
    friendRequestAlreadyPending: "You've already sent them a request.",
    challengeAlreadyActive: "You already have a challenge with them.",
  },
};
