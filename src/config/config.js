import 'dotenv/config'

export const config = {
    fbPgeToken: process.env.FB_PAGE_TOKEN,
    fbVerfyToken: process.env.FB_VERIFY_TOKEN,
    fbAppSecret: process.env.FB_APP_SECRET,
    serverUrl: process.env.SERVER_URL,
    gglePrjctId: process.env.GOOGLE_PROJECT_ID,
    dfLangCode: process.env.DF_LANGUAGE_CODE,
    ggleClientId: process.env.GOOGLE_CLIENT_EMAIL,
    gglePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
    sendgridApikey: process.env.SENDGRID_API_KEY,
    emailfrom: process.env.EMAIL_FROM,
    emailto: process.env.EMAIL_TO
}

export const checkConfigParams = () => {
    // Messenger API parameters
    if (!config.fbPgeToken) {
        throw new Error('missing FB_PAGE_TOKEN')
    }
    if (!config.fbVerfyToken) {
        throw new Error('missing FB_VERIFY_TOKEN')
    }
    if (!config.gglePrjctId) {
        throw new Error('missing GOOGLE_PROJECT_ID')
    }
    if (!config.dfLangCode) {
        throw new Error('missing DF_LANGUAGE_CODE')
    }
    if (!config.ggleClientId) {
        throw new Error('missing GOOGLE_CLIENT_EMAIL')
    }
    if (!config.gglePrivateKey) {
        throw new Error('missing GOOGLE_PRIVATE_KEY')
    }
    if (!config.fbAppSecret) {
        throw new Error('missing FB_APP_SECRET')
    }
    if (!config.serverUrl) {
        //used for ink to static files
        throw new Error('missing SERVER_URL')
    }
    if (!config.sendgridApikey) {
        //sending email
        throw new Error('missing SENGRID_API_KEY')
    }
    if (!config.emailfrom) {
        //sending email
        throw new Error('missing EMAIL_FROM')
    }
    if (!config.emailto) {
        //sending email
        throw new Error('missing EMAIL_TO')
    }
}
