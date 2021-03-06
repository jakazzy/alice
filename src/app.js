/* eslint-disable camelcase */
/* eslint-disable no-use-before-define */
/* eslint-disable no-case-declarations */
/* eslint-disable default-case */
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
import 'regenerator-runtime/runtime'
import dialogflow from 'dialogflow'
import express from 'express'
import bodyParser from 'body-parser'
import request from 'request'
import { v1 as uuidv1 } from 'uuid'
import sgMail from '@sendgrid/mail'
import { config, checkConfigParams } from './config/config'
import verifyRequestSignature from './middleware/middleware'

const app = express()
const PORT = process.env.PORT || 5000
checkConfigParams()
//verify request came from facebook
app.use(
    bodyParser.json({
        verify: verifyRequestSignature
    })
)

//serve static files in the public directory
app.use(express.static('public'))

// Process application/x-www-form-urlencoded
app.use(
    bodyParser.urlencoded({
        extended: false
    })
)

// Process application/json
app.use(bodyParser.json())

const credentials = {
    client_email: config.ggleClientId,
    private_key: config.gglePrivateKey
}

const sessionClient = new dialogflow.SessionsClient({
    projectId: config.gglePrjctId,
    credentials
})

const sessionIds = new Map()

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    console.log(
        'query: ',
        req.query['hub.mode'],
        'hubverfy',
        req.query['hub.verify_token']
    )

    if (
        req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === config.fbVerfyToken
    ) {
        res.status(200).send(req.query['hub.challenge'])
    } else {
        console.error(
            'Failed validation. Make sure the validation tokens match.'
        )
        res.sendStatus(403)
    }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messen
 * ger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook/', function (req, res) {
    const data = req.body
    console.log(JSON.stringify(data))

    // Make sure this is a page subscription
    if (data.object === 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            const pageID = pageEntry.id
            const timeOfEvent = pageEntry.time

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                if (messagingEvent.optin) {
                    receivedAuthentication(messagingEvent)
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent)
                } else if (messagingEvent.delivery) {
                    receivedDeliveryConfirmation(messagingEvent)
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent)
                } else if (messagingEvent.read) {
                    receivedMessageRead(messagingEvent)
                } else if (messagingEvent.account_linking) {
                    receivedAccountLink(messagingEvent)
                } else {
                    console.log(
                        'Webhook received unknown messagingEvent: ',
                        messagingEvent
                    )
                }
            })
        })

        // Assume all went well.
        // You must send back a 200, within 20 seconds
        res.sendStatus(200)
    }
})

function receivedMessage(event) {
    const senderID = event.sender.id
    const recipientID = event.recipient.id
    const timeOfMessage = event.timestamp
    const { message } = event

    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuidv1())
    }
    //console.log("Received message for u
    // ser %d and page %d at %d with
    //  message:", senderID, recipientID, timeOfMessage);
    //console.log(JSON.stringify(message));

    const isEcho = message.is_echo
    const messageId = message.mid
    const appId = message.app_id
    const { metadata } = message

    // You may get a text or attachment but not both
    const messageText = message.text
    const messageAttachments = message.attachments
    const quickReply = message.quick_reply

    if (isEcho) {
        handleEcho(messageId, appId, metadata)
        return
    }
    if (quickReply) {
        handleQuickReply(senderID, quickReply, messageId)
        return
    }

    if (messageText) {
        //send message to api.ai
        sendToDialogFlow(senderID, messageText)
    } else if (messageAttachments) {
        handleMessageAttachments(messageAttachments, senderID)
    }
}

function handleMessageAttachments(messageAttachments, senderID) {
    //for now just reply
    sendTextMessage(senderID, 'Attachment received. Thank you.')
}

function handleQuickReply(senderID, quickReply, messageId) {
    const quickReplyPayload = quickReply.payload
    console.log(
        'Quick reply for message %s with payload %s',
        messageId,
        quickReplyPayload
    )
    //send payload to api.ai
    sendToDialogFlow(senderID, quickReplyPayload)
}

//https://developers.facebook.com
// /docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
    // Just logging message echoes to console
    console.log(
        'Received echo for message %s and app %d with metadata %s',
        messageId,
        appId,
        metadata
    )
}

function sendEmail(subject, content) {
    console.log('sending email!')
    // const sgMail = require('@sendgrid/mail')
    sgMail.setApiKey(config.sendgridApikey)
    const msg = {
        to: config.emailto,
        from: config.emailfrom,
        subject: subject,
        text: content,
        html: content
    }
    sgMail
        .send(msg)
        .then(() => {
            console.log('Email Sent!')
        })
        .catch((error) => {
            console.log('Email NOT Sent!')
            console.error(error.toString())
        })
}

function handleDialogFlowAction(
    sender,
    action,
    messages,
    contexts,
    parameters
) {
    switch (action) {
        case 'detailed-application':
            const filteredContexts = contexts.filter(function (el) {
                return (
                    el.name.includes('job_application') ||
                    el.name.includes('job-application-details_dialog_context')
                )
            })
            if (filteredContexts.length > 0 && contexts[0].parameters) {
                const phone_number =
                    isDefined(contexts[0].parameters.fields['phone-number']) &&
                    contexts[0].parameters.fields['phone-number'] !== ''
                        ? contexts[0].parameters.fields['phone-number']
                              .stringValue
                        : ''
                const user_name =
                    isDefined(contexts[0].parameters.fields['user-name']) &&
                    contexts[0].parameters.fields['user-name'] !== ''
                        ? contexts[0].parameters.fields['user-name'].stringValue
                        : ''
                const previous_job =
                    isDefined(contexts[0].parameters.fields['previous-job']) &&
                    contexts[0].parameters.fields['previous-job'] !== ''
                        ? contexts[0].parameters.fields['previous-job']
                              .stringValue
                        : ''
                const years_of_experience =
                    isDefined(
                        contexts[0].parameters.fields['years-of-experience']
                    ) &&
                    contexts[0].parameters.fields['years-of-experience'] !== ''
                        ? contexts[0].parameters.fields['years-of-experience']
                              .stringValue
                        : ''
                const job_vacancy =
                    isDefined(contexts[0].parameters.fields['job-vacancy']) &&
                    contexts[0].parameters.fields['job-vacancy'] !== ''
                        ? contexts[0].parameters.fields['job-vacancy']
                              .stringValue
                        : ''
                if (
                    phone_number !== '' &&
                    user_name !== '' &&
                    previous_job !== '' &&
                    years_of_experience !== '' &&
                    job_vacancy !== ''
                ) {
                    const emailContent =
                        `A new job enquiery from ${user_name} 
                        for the job: ${job_vacancy}.
                        <br> Previous job position: ${previous_job}.` +
                        `.<br> Years of experience: ${years_of_experience}.` +
                        `.<br> Phone number: ${phone_number}.`

                    sendEmail('New job application', emailContent)

                    handleMessages(messages, sender)
                } else {
                    handleMessages(messages, sender)
                }
            }
            break
        default:
            //unhandled action, just send back the text
            handleMessages(messages, sender)
    }
}

function handleMessage(message, sender) {
    switch (message.message) {
        case 'text': //text
            message.text.text.forEach((text) => {
                if (text !== '') {
                    sendTextMessage(sender, text)
                }
            })
            break
        case 'quickReplies': //quick replies
            const replies = []
            message.quickReplies.quickReplies.forEach((text) => {
                const reply = {
                    content_type: 'text',
                    title: text,
                    payload: text
                }
                replies.push(reply)
            })
            sendQuickReply(sender, message.quickReplies.title, replies)
            break
        case 'image': //image
            sendImageMessage(sender, message.image.imageUri)
            break
    }
}

function handleCardMessages(messages, sender) {
    const elements = []
    for (let m = 0; m < messages.length; m++) {
        const message = messages[m]
        const buttons = []
        for (let b = 0; b < message.card.buttons.length; b++) {
            const isLink =
                message.card.buttons[b].postback.substring(0, 4) === 'http'
            let button
            if (isLink) {
                button = {
                    type: 'web_url',
                    title: message.card.buttons[b].text,
                    url: message.card.buttons[b].postback
                }
            } else {
                button = {
                    type: 'postback',
                    title: message.card.buttons[b].text,
                    payload: message.card.buttons[b].postback
                }
            }
            buttons.push(button)
        }

        const element = {
            title: message.card.title,
            image_url: message.card.imageUri,
            subtitle: message.card.subtitle,
            buttons: buttons
        }
        elements.push(element)
    }
    sendGenericMessage(sender, elements)
}

function handleMessages(messages, sender) {
    const timeoutInterval = 1100
    let previousType
    let cardTypes = []
    let timeout = 0
    for (let i = 0; i < messages.length; i++) {
        if (
            previousType === 'card' &&
            (messages[i].message !== 'card' || i === messages.length - 1)
        ) {
            timeout = (i - 1) * timeoutInterval
            setTimeout(
                handleCardMessages.bind(null, cardTypes, sender),
                timeout
            )
            cardTypes = []
            timeout = i * timeoutInterval
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout)
        } else if (
            messages[i].message === 'card' &&
            i === messages.length - 1
        ) {
            cardTypes.push(messages[i])
            timeout = (i - 1) * timeoutInterval
            setTimeout(
                handleCardMessages.bind(null, cardTypes, sender),
                timeout
            )
            cardTypes = []
        } else if (messages[i].message === 'card') {
            cardTypes.push(messages[i])
        } else {
            timeout = i * timeoutInterval
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout)
        }

        previousType = messages[i].message
    }
}

function handleDialogFlowResponse(sender, response) {
    const responseText = response.fulfillmentMessages.fulfillmentText

    const messages = response.fulfillmentMessages
    const { action } = response
    const contexts = response.outputContexts
    const { parameters } = response

    sendTypingOff(sender)

    if (isDefined(action)) {
        handleDialogFlowAction(sender, action, messages, contexts, parameters)
    } else if (isDefined(messages)) {
        handleMessages(messages, sender)
    } else if (responseText === '' && !isDefined(action)) {
        //dialogflow could not evaluate input.
        sendTextMessage(
            sender,
            "I'm not sure what you want. Can you be more specific?"
        )
    } else if (isDefined(responseText)) {
        sendTextMessage(sender, responseText)
    }
}

async function sendToDialogFlow(sender, textString, params) {
    sendTypingOn(sender)

    try {
        const sessionPath = sessionClient.sessionPath(
            config.gglePrjctId,
            sessionIds.get(sender)
        )

        const requests = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: textString,
                    languageCode: config.dfLangCode
                }
            },
            queryParams: {
                payload: {
                    data: params
                }
            }
        }
        const responses = await sessionClient.detectIntent(requests)

        const result = responses[0].queryResult
        handleDialogFlowResponse(sender, result)
    } catch (e) {
        console.log('error')
        console.log(e)
    }
}

function sendTextMessage(recipientId, text) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    }
    callSendAPI(messageData)
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId, imageUrl) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'image',
                payload: {
                    url: imageUrl
                }
            }
        }
    }

    callSendAPI(messageData)
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'image',
                payload: {
                    url: `${config.serverUrl}/assets/instagram_logo.gif`
                }
            }
        }
    }

    callSendAPI(messageData)
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'audio',
                payload: {
                    url: `${config.serverUrl}/assets/sample.mp3`
                }
            }
        }
    }

    callSendAPI(messageData)
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'video',
                payload: {
                    url: config.serverUrl + videoName
                }
            }
        }
    }

    callSendAPI(messageData)
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'file',
                payload: {
                    url: config.serverUrl + fileName
                }
            }
        }
    }

    callSendAPI(messageData)
}

/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'button',
                    text: text,
                    buttons: buttons
                }
            }
        }
    }

    callSendAPI(messageData)
}

function sendGenericMessage(recipientId, elements) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'generic',
                    elements: elements
                }
            }
        }
    }

    callSendAPI(messageData)
}

function sendReceiptMessage(
    recipientId,
    recipient_name,
    currency,
    payment_method,
    timestamp,
    elements,
    address,
    summary,
    adjustments
) {
    // Generate a random receipt ID as the API requires a unique ID
    const receiptId = `order${Math.floor(Math.random() * 1000)}`

    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'receipt',
                    recipient_name: recipient_name,
                    order_number: receiptId,
                    currency: currency,
                    payment_method: payment_method,
                    timestamp: timestamp,
                    elements: elements,
                    address: address,
                    summary: summary,
                    adjustments: adjustments
                }
            }
        }
    }

    callSendAPI(messageData)
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, text, replies, metadata) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text,
            metadata: isDefined(metadata) ? metadata : '',
            quick_replies: replies
        }
    }

    callSendAPI(messageData)
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: 'mark_seen'
    }

    callSendAPI(messageData)
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: 'typing_on'
    }

    callSendAPI(messageData)
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: 'typing_off'
    }

    callSendAPI(messageData)
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: 'template',
                payload: {
                    template_type: 'button',
                    text: 'Welcome. Link your account.',
                    buttons: [
                        {
                            type: 'account_link',
                            url: `${config.serverUrl}/authorize`
                        }
                    ]
                }
            }
        }
    }

    callSendAPI(messageData)
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
    request(
        {
            uri: 'https://graph.facebook.com/v3.2/me/messages',
            qs: {
                access_token: config.fbPgeToken
            },
            method: 'POST',
            json: messageData
        },
        function (error, response, body) {
            if (!error && response.statusCode === 200) {
                const recipientId = body.recipient_id
                const messageId = body.message_id

                if (messageId) {
                    console.log(
                        'Successfully sent message with id %s to recipient %s',
                        messageId,
                        recipientId
                    )
                } else {
                    console.log(
                        'Successfully called Send API for recipient %s',
                        recipientId
                    )
                }
            } else {
                console.error(
                    'Failed calling Send API',
                    response.statusCode,
                    response.statusMessage,
                    body.error
                )
            }
        }
    )
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/do
 * cs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback(event) {
    const senderID = event.sender.id
    const recipientID = event.recipient.id
    const timeOfPostback = event.timestamp

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    const { payload } = event.postback

    switch (payload) {
        default:
            //unindentified payload
            sendTextMessage(
                senderID,
                "I'm not sure what you want. Can you be more specific?"
            )
            break
    }

    console.log(
        "Received postback for user %d and page %d with payload '%s' " +
            'at %d',
        senderID,
        recipientID,
        payload,
        timeOfPostback
    )
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com
 * /docs/messenger-platform/webhook-reference/message-read
 *
 */
function receivedMessageRead(event) {
    const senderID = event.sender.id
    const recipientID = event.recipient.id

    // All messages before watermark (a timestamp) or sequence have been seen.
    const { watermark } = event.read
    const sequenceNumber = event.read.seq

    console.log(
        'Received message read event for watermark %d and sequence ' +
            'number %d',
        watermark,
        sequenceNumber
    )
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs
 * /messenger-platform/webhook-reference/account-linking
 *
 */
function receivedAccountLink(event) {
    const senderID = event.sender.id
    const recipientID = event.recipient.id

    const { status } = event.account_linking
    const authCode = event.account_linking.authorization_code

    console.log(
        'Received account link event with for user %d with status %s ' +
            'and auth code %s ',
        senderID,
        status,
        authCode
    )
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.
 * com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    const senderID = event.sender.id
    const recipientID = event.recipient.id
    const { delivery } = event
    const messageIDs = delivery.mids
    const { watermark } = delivery
    const sequenceNumber = delivery.seq

    if (messageIDs) {
        messageIDs.forEach(function (messageID) {
            console.log(
                'Received delivery confirmation for message ID: %s',
                messageID
            )
        })
    }

    console.log('All message before %d were delivered.', watermark)
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs
 * /messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
    const senderID = event.sender.id
    const recipientID = event.recipient.id
    const timeOfAuth = event.timestamp

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger'
    // plugin.
    const passThroughParam = event.optin.ref

    console.log(
        'Received authentication for user %d and page %d with pass ' +
            "through param '%s' at %d",
        senderID,
        recipientID,
        passThroughParam,
        timeOfAuth
    )

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, 'Authentication successful')
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */

function isDefined(obj) {
    if (typeof obj === 'undefined') {
        return false
    }

    if (!obj) {
        return false
    }

    return obj != null
}

// Spin up the server
app.listen(PORT, function () {
    console.log(`server is running on port ${PORT}`)
})
