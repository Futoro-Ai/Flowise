import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'; // Assuming correct path
import { ListToolsResult, ListToolsResultSchema, CallToolRequest, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { BaseToolkit, Tool, tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Toolkit for interacting with MCP servers over Server-Sent Events (SSE).
 */
export class SSEMCPToolkit extends BaseToolkit {
    tools: DynamicStructuredTool[] = []; // Use the specific tool type
    private _rawTools: ListToolsResult | null = null;
    client: Client | null = null;
    transport: SSEClientTransport | null = null;
    sseParams: { url: string; headers?: Record<string, string> }; // Use inline type for expected params

    /**
     * @param {{ url: string; headers?: Record<string, string> }} params Parameters for the SSE connection, typically including the URL.
     */
    constructor(params: { url: string; headers?: Record<string, string> }) {
        super();
        // Basic validation
        if (!params || !params.url) {
            throw new Error('SSEConnectionParameters with a valid URL are required.');
        }
        this.sseParams = params;
        // SSEClientTransport expects a URL object
        this.transport = new SSEClientTransport(new URL(this.sseParams.url));
        // Note: Header handling might need to be added separately if required by other servers
    }

    /**
     * Initializes the toolkit by connecting to the MCP server and fetching the list of available tools.
     * Must be called before accessing tools.
     */
    async initialize(): Promise<void> {
        if (this._rawTools === null) { // Initialize only once
            this.client = new Client(
                {
                    name: 'flowise-sse-client', // Identify the client
                    version: '1.0.0'
                },
                {
                    capabilities: {} // Define client capabilities if any
                }
            );

            if (!this.transport) {
                throw new Error('SSE Transport is not initialized.');
            }

            try {
                await this.client.connect(this.transport);
                this._rawTools = await this.client.request({ method: 'tools/list' }, ListToolsResultSchema);
                this.tools = await this.get_tools(); // Populate Langchain tools
            } catch (error) {
                // Log the error and re-throw or handle appropriately
                console.error(`Error initializing SSEMCPToolkit for URL ${this.sseParams.url}:`, error);
                // Clear state on failure
                this.client = null;
                this.transport = null;
                this._rawTools = null;
                this.tools = [];
                throw new Error(`Failed to connect or list tools from MCP server at ${this.sseParams.url}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Returns the list of Langchain Tool objects representing the MCP server's tools.
     * Requires initialize() to have been called successfully.
     * @returns {Promise<DynamicStructuredTool[]>}
     */
    async get_tools(): Promise<DynamicStructuredTool[]> {
        if (this._rawTools === null || this.client === null) {
            throw new Error('Toolkit not initialized. Call initialize() first.');
        }

        // Use Promise.all to handle async creation of tools
        const toolsPromises = this._rawTools.tools.map(async (mcpTool: any) => {
            if (!this.client) {
                // This check is technically redundant due to the check above, but good for type safety
                throw new Error('Client is not initialized during tool creation.');
            }
            return MCPToolSSE({
                client: this.client,
                name: mcpTool.name,
                description: mcpTool.description || `Invoke ${mcpTool.name} via MCP`, // Provide default description
                argsSchema: createSchemaModel(mcpTool.inputSchema) // Convert MCP schema to Zod schema
            });
        });

        return Promise.all(toolsPromises);
    }
}

/**
 * Helper function to create a Langchain Tool that calls an MCP tool via SSE.
 */
async function MCPToolSSE({
    client,
    name,
    description,
    argsSchema
}: {
    client: Client;
    name: string;
    description: string;
    argsSchema: z.ZodObject<any>;
}): Promise<DynamicStructuredTool> { // Return the specific tool type
    // Use the tool() factory function instead of 'new Tool()'
    return tool(
        async (input: z.infer<typeof argsSchema>): Promise<string> => {
            const request: CallToolRequest = {
                method: 'tools/call',
                params: { name: name, arguments: input }
            };
            try {
                const response = await client.request(request, CallToolResultSchema);
                // Process the response content. Assume text content primarily.
                const responseText = response.content
                    .filter((part: any) => part.type === 'text')
                    .map((part: any) => (part as { type: 'text'; text: string }).text) // Type assertion
                    .join('\n');
                // Consider adding handling for other types like 'resource' or 'image' if needed later
                return responseText || '[No text content returned]'; // Return something if no text parts
            } catch (error) {
                console.error(`Error calling MCP tool '${name}' via SSE:`, error);
                return `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`;
            }
        },
        {
            name: name,
            description: description,
            schema: argsSchema
        }
    );
}


/**
 * Converts an MCP input schema (simplified representation) into a Zod schema
 * for Langchain tool validation.
 * Note: This is a basic implementation assuming properties are 'any'.
 * Real-world usage might require more sophisticated schema conversion.
 */
function createSchemaModel(
    inputSchema: any // Assuming inputSchema structure based on core.ts usage
): z.ZodObject<any> {
    if (!inputSchema || typeof inputSchema !== 'object' || inputSchema.type !== 'object' || !inputSchema.properties) {
        // Return an empty object schema if input is invalid or has no properties
        console.warn('Invalid or empty input schema received for MCP tool. Defaulting to empty object schema.');
        return z.object({});
    }

    try {
        const schemaProperties = Object.entries(inputSchema.properties).reduce((acc, [key, propSchema]: [string, any]) => {
            // Basic type mapping - extend as needed
            let zodType: z.ZodTypeAny;
            switch (propSchema?.type) {
                case 'string':
                    zodType = z.string();
                    break;
                case 'number':
                    zodType = z.number();
                    break;
                case 'boolean':
                    zodType = z.boolean();
                    break;
                case 'integer':
                    zodType = z.number().int();
                    break;
                // Add cases for array, object, etc. if needed
                default:
                    zodType = z.any(); // Fallback for unknown or complex types
            }

            // Handle optionality based on 'required' array if present
            const isRequired = Array.isArray(inputSchema.required) && inputSchema.required.includes(key);
            acc[key] = isRequired ? zodType : zodType.optional();

            // Add description if available
            if (propSchema?.description) {
                acc[key] = acc[key].describe(propSchema.description);
            }

            return acc;
        }, {} as Record<string, z.ZodTypeAny>);

        return z.object(schemaProperties);
    } catch (error) {
        console.error("Error converting MCP schema to Zod schema:", error, "Input Schema:", inputSchema);
        // Fallback to a permissive schema on error
        return z.object({}).passthrough();
    }
}