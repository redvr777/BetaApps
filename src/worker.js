const encoder = new TextEncoder();

function json(data, status = 200) {
return new Response(
JSON.stringify(data),
{
status,
headers: {
"Content-Type": "application/json"
}
}
);
}

function clean(value, maxLength = 1500) {
if (typeof value !== "string") {
return "";
}

```
return value
    .replace(/\0/g, "")
    .trim()
    .slice(0, maxLength);
```

}

async function hash(value) {
const result = await crypto.subtle.digest(
"SHA-256",
encoder.encode(value)
);

```
return Array.from(
    new Uint8Array(result)
)
    .map(byte =>
        byte.toString(16).padStart(2, "0")
    )
    .join("");
```

}

function getIp(request) {
return request.headers.get("CF-Connecting-IP") || "";
}

async function saveToGitHub(application, env) {
const filePath =
`applications/${application.applicationId}.json`;

```
const content = btoa(
    unescape(
        encodeURIComponent(
            JSON.stringify(application, null, 2)
        )
    )
);

const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`,
    {
        method: "PUT",

        headers: {
            "Authorization":
                `Bearer ${env.GITHUB_TOKEN}`,

            "Accept":
                "application/vnd.github+json",

            "Content-Type":
                "application/json",

            "X-GitHub-Api-Version":
                "2022-11-28",

            "User-Agent":
                "Monkum-Beta-System"
        },

        body: JSON.stringify({
            message:
                `New Monkum beta application: ${application.metaUsername}`,

            content,

            branch:
                env.GITHUB_BRANCH || "main"
        })
    }
);

if (!response.ok) {
    console.error(
        "GitHub Error:",
        await response.text()
    );

    throw new Error(
        "Unable to save application."
    );
}
```

}

export default {
async fetch(request, env) {

```
    const url = new URL(request.url);

    if (
        request.method !== "POST" ||
        url.pathname !== "/api/submit"
    ) {
        return new Response("Not found", {
            status: 404
        });
    }

    try {
        const body = await request.json();

        const email =
            clean(body.email, 254).toLowerCase();

        const metaUsername =
            clean(body.metaUsername, 50);

        const discordUsername =
            clean(body.discordUsername, 50);

        const age =
            clean(body.age, 30);

        const headset =
            clean(body.headset, 50);

        const playTime =
            clean(body.playTime, 50);

        const betaExperience =
            clean(body.betaExperience, 20);

        const availability =
            clean(body.availability, 50);

        const bugReporting =
            clean(body.bugReporting, 50);

        const whyBeta =
            clean(body.whyBeta, 1500);

        const feedback =
            clean(body.feedback, 1500);

        if (
            !email ||
            !email.includes("@") ||
            !metaUsername ||
            !age ||
            !headset ||
            !playTime ||
            !betaExperience ||
            !availability ||
            !bugReporting ||
            !whyBeta
        ) {
            return json({
                success: false,
                error:
                    "Please complete all required fields."
            }, 400);
        }

        /*
         * Get the visitor's IP from Cloudflare.
         * We only store its SHA-256 hash in KV.
         */
        const ip = getIp(request);

        if (!ip) {
            return json({
                success: false,
                error:
                    "Unable to verify your network."
            }, 400);
        }

        const ipHash =
            await hash(ip);

        const emailHash =
            await hash(email);

        const metaHash =
            await hash(
                metaUsername.toLowerCase()
            );

        const ipKey =
            `rate:ip:${ipHash}`;

        const emailKey =
            `submitted:email:${emailHash}`;

        const metaKey =
            `submitted:meta:${metaHash}`;

        /*
         * IP LIMIT:
         * One submission from the same IP every 24 hours.
         */
        if (
            await env.BETA_KV.get(ipKey)
        ) {
            return json({
                success: false,
                error:
                    "A beta application was already submitted from this network. Please try again in 24 hours."
            }, 429);
        }

        /*
         * EMAIL DUPLICATE CHECK:
         * One application per email.
         */
        if (
            await env.BETA_KV.get(emailKey)
        ) {
            return json({
                success: false,
                error:
                    "This email has already submitted a beta application."
            }, 409);
        }

        /*
         * META USERNAME DUPLICATE CHECK:
         * One application per VR username.
         */
        if (
            await env.BETA_KV.get(metaKey)
        ) {
            return json({
                success: false,
                error:
                    "This Meta/VR username has already submitted a beta application."
            }, 409);
        }

        const applicationId =
            crypto.randomUUID();

        const application = {
            applicationId,

            submittedAt:
                new Date().toISOString(),

            email,

            metaUsername,

            discordUsername:
                discordUsername || null,

            age,

            headset,

            experience: {
                playTime,
                betaExperience,
                availability,
                bugReporting
            },

            answers: {
                whyBeta,
                feedback:
                    feedback || null
            }
        };

        /*
         * Save the application to GitHub FIRST.
         *
         * Only mark the email/IP/username as used
         * after GitHub successfully saves it.
         */
        await saveToGitHub(
            application,
            env
        );

        await Promise.all([
            /*
             * IP marker automatically expires after 24 hours.
             */
            env.BETA_KV.put(
                ipKey,
                "1",
                {
                    expirationTtl: 86400
                }
            ),

            /*
             * Email stays blocked from submitting again.
             */
            env.BETA_KV.put(
                emailKey,
                "1"
            ),

            /*
             * Meta username stays blocked from submitting again.
             */
            env.BETA_KV.put(
                metaKey,
                "1"
            )
        ]);

        return json({
            success: true,
            applicationId
        }, 201);

    } catch (error) {
        console.error(error);

        return json({
            success: false,
            error:
                "Something went wrong while submitting your application."
        }, 500);
    }
}
```

};
