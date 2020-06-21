import 'dotenv/config'

export default {
    fbPgeToken: process.env.FB_PAGE_TOKEN,
    fbVerfyToken: process.env.VERIFY_TOKEN,
    fbAppSecret: process.env.FB_APP_SECRET,
    serverUrl: process.env.SERVER_URL,
    gglePrjctId: process.env.GOOGLE_PROJECT_ID,
    dfLangCode: process.env.DF_LANGUAGE_CODE,
    ggleClientId: process.env.GOOGLE_CLIENT_EMAIL,
    gglePrivateKey: process.env.GOOGLE_PRIVATE_KEY
}
