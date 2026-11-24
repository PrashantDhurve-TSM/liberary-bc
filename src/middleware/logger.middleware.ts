import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    use(req:Request,res:Response,next:NextFunction){
        const logger = new Logger("API-Detail")
        
        logger.log("Method --"+ req.method + " --"+ req.url)
        
        next()
    }
}