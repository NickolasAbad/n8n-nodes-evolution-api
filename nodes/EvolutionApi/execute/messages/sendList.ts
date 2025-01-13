import {
	IExecuteFunctions,
	IRequestOptions,
	IHttpRequestMethods,
	NodeOperationError,
} from 'n8n-workflow';
import { evolutionRequest } from '../evolutionRequest';

export async function sendList(ef: IExecuteFunctions) {
	try {
		// Todos os items que chegam ao Node
		const items = ef.getInputData();

		// Parâmetros básicos (um só item de referência, index=0)
		const instanceName = ef.getNodeParameter('instanceName', 0) as string;
		const remoteJid = ef.getNodeParameter('remoteJid', 0) as string;
		const title = ef.getNodeParameter('title', 0) as string;
		const description = ef.getNodeParameter('description', 0) as string;
		const buttonText = ef.getNodeParameter('buttonText', 0) as string;
		const footerText = ef.getNodeParameter('footerText', 0) as string;

		// Modo automático ou manual?
		const enableAutoRows = ef.getNodeParameter('enableAutoRows', 0, false) as boolean;

		// Seções manuais
		const manualSections = ef.getNodeParameter('sections.sectionValues', 0, []) as {
			title: string;
			rows: {
				rowValues: {
					title: string;
					description?: string;
					rowId?: string;
				}[];
			};
		}[];

		// Opções adicionais (delay, quoted, mentions)
		const options = ef.getNodeParameter('options_message', 0, {}) as {
			delay?: number;
			quoted?: {
				messageQuoted: {
					messageId: string;
				};
			};
			mentions?: {
				mentionsSettings: {
					mentionsEveryOne: boolean;
					mentioned?: string;
				};
			};
		};

		// Array final de seções (pode ser 1 ou várias)
		let finalSections: Array<{ title: string; rows: any[] }> = [];

		// =====================================================
		// MODO AUTOMÁTICO
		// =====================================================
		if (enableAutoRows) {

			// Montamos UM array de rows para TODOS os items.
			const rows: any[] = [];

			for (let i = 0; i < items.length; i++) {
				// Para cada item, lemos as expressões definidas:
				// ex: "Produto: {{ $json.nome_produto }}"
				const sectionTitle = ef.getNodeParameter('titleAuto', 0) as string;
				const rowTitle = ef.getNodeParameter('rowTitleExp', i) as string;
				const rowDescription = ef.getNodeParameter('rowDescriptionExp', i) as string;
				const rowId = ef.getNodeParameter('rowIdExp', i) as string;

				rows.push({
					title: rowTitle,
					description: rowDescription,
					rowId: rowId || `row_${i + 1}`,
				});
			}

			finalSections = [
				{
					title: sectionTitle
					rows,
				},
			];
		} else {
			// =====================================================
			// MODO MANUAL (padrão antigo)
			// =====================================================
			if (!Array.isArray(manualSections) || manualSections.length === 0) {
				const errorData = {
					success: false,
					error: {
						message: 'Lista de seções inválida',
						details: 'É necessário fornecer pelo menos uma seção com opções',
						code: 'INVALID_SECTIONS',
						timestamp: new Date().toISOString(),
					},
				};
				return { json: errorData, error: errorData };
			}

			// Constrói as seções manualmente
			finalSections = manualSections.map((section) => ({
				title: section.title,
				rows: section.rows.rowValues.map((row) => ({
					title: row.title,
					description: row.description || '',
					rowId: row.rowId || `${section.title}_${row.title}`,
				})),
			}));
		}

		// =====================================================
		// Monta o body final
		// =====================================================
		const body: any = {
			number: remoteJid,
			title,
			description,
			buttonText,
			footerText,
			sections: finalSections,
		};

		if (options.delay) {
			body.delay = options.delay;
		}

		// Quoted message
		if (options.quoted?.messageQuoted?.messageId) {
			body.quoted = {
				key: {
					id: options.quoted.messageQuoted.messageId,
				},
			};
		}

		// Mentions
		if (options.mentions?.mentionsSettings) {
			const { mentionsEveryOne, mentioned } = options.mentions.mentionsSettings;
			if (mentionsEveryOne) {
				body.mentionsEveryOne = true;
			} else if (mentioned) {
				const mentionedNumbers = mentioned
					.split(',')
					.map((num) => num.trim())
					.map((num) => (num.includes('@s.whatsapp.net') ? num : `${num}@s.whatsapp.net`));

				body.mentioned = mentionedNumbers;
			}
		}

		// Cria request
		const requestOptions: IRequestOptions = {
			method: 'POST' as IHttpRequestMethods,
			headers: { 'Content-Type': 'application/json' },
			uri: `/message/sendList/${instanceName}`,
			body,
			json: true,
		};

		// Dispara
		const response = await evolutionRequest(ef, requestOptions);

		// Retorna UM item final com a resposta
		return [
			{
				json: {
					success: true,
					data: response,
				},
			},
		];
	} catch (error) {
		const errorData = {
			success: false,
			error: {
				message: error.message.includes('Could not get parameter')
					? 'Parâmetros inválidos ou ausentes'
					: 'Erro ao enviar lista',
				details: error.message.includes('Could not get parameter')
					? 'Verifique se todos os campos obrigatórios foram preenchidos corretamente'
					: error.message,
				code: error.code || 'UNKNOWN_ERROR',
				timestamp: new Date().toISOString(),
			},
		};

		if (!ef.continueOnFail()) {
			throw new NodeOperationError(ef.getNode(), error.message, {
				message: errorData.error.message,
				description: errorData.error.details,
			});
		}
		return [{ json: errorData, error: errorData }];
	}
}
