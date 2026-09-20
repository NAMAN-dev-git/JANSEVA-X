import { prisma } from "../lib/prisma";
import { EmployeeRepository } from "./employee.repository";
declare module "./employee.repository" { interface EmployeeRepository { documentApplication(documentId: string): Promise<{ id: string; assignedOfficerId: string | null } | null>; } }
EmployeeRepository.prototype.documentApplication = async function documentApplication(documentId: string) { const link = await prisma.applicationDocument.findFirst({ where: { documentId }, select: { application: { select: { id: true, assignedOfficerId: true } } } }); return link?.application ?? null; };
