export const triggerWebhook = async (
    url: string,
    apiKey: string,
    payload: Record<string, any>,
    label: string,
) => {
    // try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (apiKey) {
            headers['x-internal-api-key'] = apiKey;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        const responseBody = await response.text();

        console.log(
            `[${label} webhook] Response status:`,
            response.status,
        );

        console.log(
            `[${label} webhook] Response body:`,
            responseBody,
        );
          
        return {
            ok: response.ok,
            status: response.status,
            body: responseBody,
        };

    // } catch (error) {
    //     console.error(
    //         `[${label} webhook] Failed to notify:`,
    //         error,
    //     );
    // }
};
