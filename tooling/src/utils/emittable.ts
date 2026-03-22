import type { TokenValue } from '../types/tokens.js';
import { isVariableAlias } from '../types/tokens.js';

export function canEmitUntypedTokenValue(rawValue: TokenValue['$value']): boolean {
    if (rawValue == null) return false;
    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
        return true;
    }
    if (isVariableAlias(rawValue)) {
        const aliasId = rawValue.id?.trim();
        return !!aliasId;
    }
    return false;
}

export function canEmitTokenValue(varType: string | undefined, rawValue: TokenValue['$value']): boolean {
    if (rawValue == null) return false;

    if (!varType) {
        return canEmitUntypedTokenValue(rawValue);
    }

    if (Array.isArray(rawValue)) {
        return varType === 'shadow';
    }

    if (typeof rawValue === 'object') {
        if (isVariableAlias(rawValue)) {
            const aliasId = rawValue.id?.trim();
            return !!aliasId;
        }

        if (varType === 'shadow') return true;

        if (varType === 'typography') {
            const family = (rawValue as any).fontFamily;
            const size = (rawValue as any).fontSize;
            return family != null && size != null;
        }

        if (varType === 'border') {
            const { width, style, color } = rawValue as any;
            return width != null && style != null && color != null;
        }

        return false;
    }

    return true;
}
